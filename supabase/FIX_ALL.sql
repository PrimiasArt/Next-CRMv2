-- ============================================================
-- NEXT-CRM: CHẠY FILE NÀY TRONG SUPABASE SQL EDITOR
-- Bao gồm: custom_roles + auth trigger + dynamic RLS + fix dữ liệu
-- ============================================================

-- ==================== PHẦN 1: CUSTOM ROLES ====================

-- 1a. Drop CHECK constraints cũ (cho phép role tùy chỉnh)
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE invites DROP CONSTRAINT IF EXISTS invites_role_check;

-- 1b. Tạo bảng custom_roles (nếu chưa có)
CREATE TABLE IF NOT EXISTS custom_roles (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  display_name text NOT NULL,
  description text,
  permissions jsonb NOT NULL DEFAULT '[]',
  color text DEFAULT 'default',
  icon text DEFAULT 'user',
  is_system boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_custom_roles_tenant ON custom_roles(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_custom_roles_name ON custom_roles(tenant_id, name);

-- 1c. RLS cho custom_roles
ALTER TABLE custom_roles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'custom_roles' AND policyname = 'read_custom_roles') THEN
    CREATE POLICY "read_custom_roles" ON custom_roles FOR SELECT
      USING (tenant_id = public.get_tenant_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'custom_roles' AND policyname = 'admin_insert_custom_roles') THEN
    CREATE POLICY "admin_insert_custom_roles" ON custom_roles FOR INSERT
      WITH CHECK (tenant_id = public.get_tenant_id() AND public.get_user_role() = 'admin');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'custom_roles' AND policyname = 'admin_update_custom_roles') THEN
    CREATE POLICY "admin_update_custom_roles" ON custom_roles FOR UPDATE
      USING (tenant_id = public.get_tenant_id() AND public.get_user_role() = 'admin');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'custom_roles' AND policyname = 'admin_delete_custom_roles') THEN
    CREATE POLICY "admin_delete_custom_roles" ON custom_roles FOR DELETE
      USING (tenant_id = public.get_tenant_id() AND public.get_user_role() = 'admin');
  END IF;
END $$;

-- 1d. Trigger updated_at
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_custom_roles_updated') THEN
    CREATE TRIGGER trg_custom_roles_updated BEFORE UPDATE ON custom_roles
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;

-- 1e. Seed default roles cho mỗi tenant (bỏ qua nếu đã có)
INSERT INTO custom_roles (tenant_id, name, display_name, description, permissions, color, icon, is_system)
SELECT t.id, 'admin', 'Quản Trị', 'Toàn quyền quản trị hệ thống',
  '["dashboard.view","orders.view","orders.create","orders.edit","orders.delete","orders.export","products.view","products.create","products.edit","products.delete","customers.view","customers.create","customers.edit","customers.delete","warehouses.view","warehouses.manage","inventory.view","inventory.manage","settings.view","settings.team","settings.channels","settings.api","settings.currency","audit.view"]'::jsonb,
  'red', 'crown', true
FROM tenants t
WHERE NOT EXISTS (SELECT 1 FROM custom_roles cr WHERE cr.tenant_id = t.id AND cr.name = 'admin');

INSERT INTO custom_roles (tenant_id, name, display_name, description, permissions, color, icon, is_system)
SELECT t.id, 'staff', 'Nhân Viên', 'Tạo và chỉnh sửa đơn hàng, sản phẩm, khách hàng',
  '["dashboard.view","orders.view","orders.create","orders.edit","orders.export","products.view","products.create","products.edit","customers.view","customers.create","customers.edit","warehouses.view","inventory.view","settings.view"]'::jsonb,
  'blue', 'user', true
FROM tenants t
WHERE NOT EXISTS (SELECT 1 FROM custom_roles cr WHERE cr.tenant_id = t.id AND cr.name = 'staff');

INSERT INTO custom_roles (tenant_id, name, display_name, description, permissions, color, icon, is_system)
SELECT t.id, 'warehouse', 'Kho Vận', 'Quản lý kho hàng, tồn kho, xem đơn hàng',
  '["dashboard.view","orders.view","products.view","warehouses.view","warehouses.manage","inventory.view","inventory.manage","settings.view"]'::jsonb,
  'orange', 'home', true
FROM tenants t
WHERE NOT EXISTS (SELECT 1 FROM custom_roles cr WHERE cr.tenant_id = t.id AND cr.name = 'warehouse');

INSERT INTO custom_roles (tenant_id, name, display_name, description, permissions, color, icon, is_system)
SELECT t.id, 'viewer', 'Xem', 'Chỉ xem dữ liệu, không thể tạo hoặc sửa',
  '["dashboard.view","orders.view","products.view","customers.view","warehouses.view","inventory.view","settings.view"]'::jsonb,
  'default', 'eye', true
FROM tenants t
WHERE NOT EXISTS (SELECT 1 FROM custom_roles cr WHERE cr.tenant_id = t.id AND cr.name = 'viewer');


-- ==================== PHẦN 2: AUTH TRIGGER ====================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  invite_record record;
  meta jsonb;
  new_tenant_id uuid;
  slug text;
BEGIN
  meta := new.raw_user_meta_data;

  IF meta->>'invite_code' IS NOT NULL THEN
    SELECT * INTO invite_record FROM public.invites
    WHERE invite_code = upper(meta->>'invite_code')
      AND used_at IS NULL
    LIMIT 1;

    IF invite_record.id IS NOT NULL THEN
      INSERT INTO public.profiles (id, tenant_id, role, full_name)
      VALUES (new.id, invite_record.tenant_id, invite_record.role, COALESCE(meta->>'full_name', ''))
      ON CONFLICT (id) DO NOTHING;

      UPDATE public.invites SET used_at = now() WHERE id = invite_record.id;
    END IF;

  ELSIF meta->>'tenant_name' IS NOT NULL THEN
    slug := lower(regexp_replace(meta->>'tenant_name', '\s+', '-', 'g'));
    slug := regexp_replace(slug, '[^a-z0-9-]', '', 'g');
    slug := slug || '-' || substr(new.id::text, 1, 8);

    INSERT INTO public.tenants (name, slug)
    VALUES (meta->>'tenant_name', slug)
    RETURNING id INTO new_tenant_id;

    INSERT INTO public.profiles (id, tenant_id, role, full_name)
    VALUES (new.id, new_tenant_id, 'admin', COALESCE(meta->>'full_name', ''))
    ON CONFLICT (id) DO NOTHING;
  END IF;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ==================== PHẦN 3: DYNAMIC RLS ====================
-- Thay thế hardcoded role checks bằng permission-based checks

-- 3a. Tạo function kiểm tra quyền từ custom_roles
CREATE OR REPLACE FUNCTION public.has_permission(perm text)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.custom_roles cr
    WHERE cr.tenant_id = public.get_tenant_id()
      AND cr.name = public.get_user_role()
      AND cr.permissions ? perm
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 3b. Xóa policies cũ (hardcoded roles)

-- customers
DROP POLICY IF EXISTS "staff_insert_customers" ON customers;
DROP POLICY IF EXISTS "staff_update_customers" ON customers;
DROP POLICY IF EXISTS "admin_delete_customers" ON customers;

-- products
DROP POLICY IF EXISTS "staff_insert_products" ON products;
DROP POLICY IF EXISTS "staff_update_products" ON products;
DROP POLICY IF EXISTS "admin_delete_products" ON products;

-- orders
DROP POLICY IF EXISTS "staff_insert_orders" ON orders;
DROP POLICY IF EXISTS "staff_update_orders" ON orders;
DROP POLICY IF EXISTS "admin_delete_orders" ON orders;

-- order_items
DROP POLICY IF EXISTS "staff_insert_order_items" ON order_items;
DROP POLICY IF EXISTS "staff_update_order_items" ON order_items;
DROP POLICY IF EXISTS "admin_delete_order_items" ON order_items;

-- warehouses
DROP POLICY IF EXISTS "manage_insert_warehouses" ON warehouses;
DROP POLICY IF EXISTS "manage_update_warehouses" ON warehouses;
DROP POLICY IF EXISTS "admin_delete_warehouses" ON warehouses;

-- 3c. Tạo policies mới (dynamic permission)

-- CUSTOMERS
CREATE POLICY "perm_insert_customers" ON customers FOR INSERT
  WITH CHECK (tenant_id = public.get_tenant_id() AND public.has_permission('customers.create'));
CREATE POLICY "perm_update_customers" ON customers FOR UPDATE
  USING (tenant_id = public.get_tenant_id() AND public.has_permission('customers.edit'));
CREATE POLICY "perm_delete_customers" ON customers FOR DELETE
  USING (tenant_id = public.get_tenant_id() AND public.has_permission('customers.delete'));

-- PRODUCTS
CREATE POLICY "perm_insert_products" ON products FOR INSERT
  WITH CHECK (tenant_id = public.get_tenant_id() AND public.has_permission('products.create'));
CREATE POLICY "perm_update_products" ON products FOR UPDATE
  USING (tenant_id = public.get_tenant_id() AND public.has_permission('products.edit'));
CREATE POLICY "perm_delete_products" ON products FOR DELETE
  USING (tenant_id = public.get_tenant_id() AND public.has_permission('products.delete'));

-- ORDERS
CREATE POLICY "perm_insert_orders" ON orders FOR INSERT
  WITH CHECK (tenant_id = public.get_tenant_id() AND public.has_permission('orders.create'));
CREATE POLICY "perm_update_orders" ON orders FOR UPDATE
  USING (tenant_id = public.get_tenant_id() AND public.has_permission('orders.edit'));
CREATE POLICY "perm_delete_orders" ON orders FOR DELETE
  USING (tenant_id = public.get_tenant_id() AND public.has_permission('orders.delete'));

-- ORDER_ITEMS (quyền theo orders)
CREATE POLICY "perm_insert_order_items" ON order_items FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM orders WHERE orders.id = order_items.order_id AND orders.tenant_id = public.get_tenant_id())
    AND public.has_permission('orders.create')
  );
CREATE POLICY "perm_update_order_items" ON order_items FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM orders WHERE orders.id = order_items.order_id AND orders.tenant_id = public.get_tenant_id())
    AND public.has_permission('orders.edit')
  );
CREATE POLICY "perm_delete_order_items" ON order_items FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM orders WHERE orders.id = order_items.order_id AND orders.tenant_id = public.get_tenant_id())
    AND public.has_permission('orders.delete')
  );

-- WAREHOUSES
CREATE POLICY "perm_insert_warehouses" ON warehouses FOR INSERT
  WITH CHECK (tenant_id = public.get_tenant_id() AND public.has_permission('warehouses.manage'));
CREATE POLICY "perm_update_warehouses" ON warehouses FOR UPDATE
  USING (tenant_id = public.get_tenant_id() AND public.has_permission('warehouses.manage'));
CREATE POLICY "perm_delete_warehouses" ON warehouses FOR DELETE
  USING (tenant_id = public.get_tenant_id() AND public.get_user_role() = 'admin');


-- ==================== PHẦN 3.5: INVITE CODE CHO ADMIN TẠO TK ====================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS invite_code text;


-- ==================== PHẦN 4: FIX DỮ LIỆU CŨ ====================

-- 4a. Tạo profile cho user đã đăng ký nhưng chưa có profile (match bằng email)
INSERT INTO profiles (id, tenant_id, role, full_name)
SELECT DISTINCT ON (au.id)
  au.id,
  i.tenant_id,
  i.role,
  COALESCE(au.raw_user_meta_data->>'full_name', split_part(au.email, '@', 1))
FROM auth.users au
JOIN invites i ON lower(au.email) = lower(i.email)
WHERE i.email IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = au.id)
ORDER BY au.id, i.created_at DESC
ON CONFLICT (id) DO NOTHING;

-- 4b. Tạo profile cho user có invite_code trong metadata
INSERT INTO profiles (id, tenant_id, role, full_name)
SELECT DISTINCT ON (au.id)
  au.id,
  i.tenant_id,
  i.role,
  COALESCE(au.raw_user_meta_data->>'full_name', split_part(au.email, '@', 1))
FROM auth.users au
JOIN invites i ON upper(au.raw_user_meta_data->>'invite_code') = i.invite_code
WHERE au.raw_user_meta_data->>'invite_code' IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = au.id)
ORDER BY au.id, i.created_at DESC
ON CONFLICT (id) DO NOTHING;

-- 4c. Đánh dấu invite đã dùng (match bằng email)
UPDATE invites
SET used_at = now()
WHERE used_at IS NULL
  AND email IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM auth.users au
    WHERE lower(au.email) = lower(invites.email)
  );

-- 4d. Đánh dấu invite đã dùng (match bằng invite_code trong metadata)
UPDATE invites
SET used_at = now()
WHERE used_at IS NULL
  AND EXISTS (
    SELECT 1 FROM auth.users au
    WHERE upper(au.raw_user_meta_data->>'invite_code') = invites.invite_code
  );

-- ==================== HOÀN TẤT ====================
SELECT 'Profiles' as "Bảng", count(*) as "Số lượng" FROM profiles
UNION ALL
SELECT 'Custom Roles', count(*) FROM custom_roles
UNION ALL
SELECT 'Invites (chưa dùng)', count(*) FROM invites WHERE used_at IS NULL
UNION ALL
SELECT 'Invites (đã dùng)', count(*) FROM invites WHERE used_at IS NOT NULL;
