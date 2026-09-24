'use client';

import { useState } from 'react';
import { Table, Tag, Select, Button, Popconfirm, Space, Card, Empty, App, Tooltip, Typography, Modal, Form, Input } from 'antd';
import { DeleteOutlined, CrownOutlined, UserOutlined, HomeOutlined, EyeOutlined, SafetyCertificateOutlined, TeamOutlined, UserAddOutlined, CopyOutlined, LockOutlined } from '@ant-design/icons';
import { useLocale } from '@/hooks/useLocale';
import { useAuth } from '@/hooks/useAuth';
import type { TeamMember } from '@/hooks/useTeam';
import type { Role } from '@/lib/supabase/types';
import type { CustomRole } from '@/lib/services/role.service';

const { Text } = Typography;

const ICON_MAP: Record<string, React.ReactNode> = {
  crown: <CrownOutlined />,
  user: <UserOutlined />,
  home: <HomeOutlined />,
  eye: <EyeOutlined />,
  shield: <SafetyCertificateOutlined />,
  team: <TeamOutlined />,
};

interface Props {
  members: TeamMember[];
  loading: boolean;
  roles: CustomRole[];
  onChangeRole: (memberId: string, role: Role) => Promise<void>;
  onRemove: (memberId: string) => Promise<void>;
  onRefresh?: () => void;
}

export function TeamTable({ members, loading, roles, onChangeRole, onRemove, onRefresh }: Props) {
  const { t } = useLocale();
  const { user, profile } = useAuth();
  const { message } = App.useApp();
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createdInfo, setCreatedInfo] = useState<{ email: string; inviteCode: string } | null>(null);
  const [createForm] = Form.useForm();
  const [pwModalMember, setPwModalMember] = useState<TeamMember | null>(null);
  const [changingPw, setChangingPw] = useState(false);
  const [pwForm] = Form.useForm();

  const getRoleMeta = (roleName: string) => {
    const r = roles.find((role) => role.name === roleName);
    return r ? { color: r.color, icon: ICON_MAP[r.icon] || <UserOutlined />, displayName: r.display_name, desc: r.description }
      : { color: 'default', icon: <UserOutlined />, displayName: roleName, desc: '' };
  };

  const handleRoleChange = async (memberId: string, role: Role) => {
    try {
      await onChangeRole(memberId, role);
      message.success(t('common.save'));
    } catch {
      message.error('Failed to change role');
    }
  };

  const handleCreateAccount = async () => {
    const values = await createForm.validateFields();
    setCreating(true);
    try {
      const res = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (!res.ok) {
        message.error(data.error || 'Failed');
        setCreating(false);
        return;
      }
      setCreatedInfo({ email: values.email, inviteCode: data.inviteCode });
      createForm.resetFields();
      onRefresh?.();
    } catch {
      message.error('Failed to create account');
    }
    setCreating(false);
  };

  const copyInviteCode = () => {
    if (createdInfo) {
      navigator.clipboard.writeText(createdInfo.inviteCode);
      message.success(t('settings.code_copied'));
    }
  };

  const isAdmin = profile?.role === 'admin';

  const handleAdminChangePw = async () => {
    if (!pwModalMember) return;
    const values = await pwForm.validateFields();
    if (values.new_password !== values.confirm_password) {
      message.error(t('settings.pw_mismatch'));
      return;
    }
    setChangingPw(true);
    try {
      const res = await fetch('/api/admin/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: pwModalMember.id, newPassword: values.new_password }),
      });
      const data = await res.json();
      if (!res.ok) {
        message.error(data.error || 'Failed');
      } else {
        message.success(t('settings.pw_changed'));
        setPwModalMember(null);
        pwForm.resetFields();
      }
    } catch {
      message.error(t('settings.pw_change_failed'));
    }
    setChangingPw(false);
  };

  const columns = [
    {
      title: t('settings.member_name'),
      key: 'name',
      render: (_: unknown, r: TeamMember) => (
        <Space>
          {r.full_name || '-'}
          {r.id === user?.id && <Tag color="green">{t('settings.you')}</Tag>}
        </Space>
      ),
    },
    {
      title: t('auth.email'),
      dataIndex: 'email',
      key: 'email',
      render: (v: string | null) => v || '-',
    },
    {
      title: t('settings.role'),
      key: 'role',
      width: 200,
      render: (_: unknown, r: TeamMember) => {
        const meta = getRoleMeta(r.role);
        if (r.id === user?.id) {
          return (
            <Tooltip title={meta.desc}>
              <Tag color={meta.color} icon={meta.icon}>{meta.displayName}</Tag>
            </Tooltip>
          );
        }
        return (
          <Select
            value={r.role}
            onChange={(v) => handleRoleChange(r.id, v)}
            style={{ width: 180 }}
            size="small"
            options={roles.map((role) => ({
              value: role.name,
              label: (
                <Space size={4}>
                  {ICON_MAP[role.icon] || <UserOutlined />}
                  <span>{role.display_name}</span>
                </Space>
              ),
            }))}
          />
        );
      },
    },
    {
      title: t('settings.joined'),
      dataIndex: 'created_at',
      key: 'joined',
      render: (v: string) => new Date(v).toLocaleDateString('vi-VN'),
    },
    {
      title: t('common.actions'),
      key: 'actions',
      width: 120,
      render: (_: unknown, r: TeamMember) => {
        if (r.id === user?.id) return null;
        return (
          <Space size={0}>
            {isAdmin && (
              <Tooltip title={t('settings.change_password')}>
                <Button type="link" icon={<LockOutlined />} size="small" onClick={() => setPwModalMember(r)} />
              </Tooltip>
            )}
            <Popconfirm title={t('settings.confirm_remove')} onConfirm={() => onRemove(r.id)}>
              <Button type="link" danger icon={<DeleteOutlined />} size="small" />
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  return (
    <Card title={t('settings.team')} style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {t('role.team_hint')}
        </Text>
        {isAdmin && (
          <Button type="primary" icon={<UserAddOutlined />} onClick={() => setCreateModalOpen(true)}>
            {t('settings.create_account')}
          </Button>
        )}
      </div>
      {members.length === 0 && !loading ? (
        <Empty description={t('settings.no_members')} />
      ) : (
        <Table
          columns={columns}
          dataSource={members}
          loading={loading}
          rowKey="id"
          pagination={false}
          size="small"
        />
      )}

      <Modal
        title={t('settings.create_account')}
        open={createModalOpen}
        onCancel={() => { setCreateModalOpen(false); setCreatedInfo(null); }}
        footer={createdInfo ? [
          <Button key="close" onClick={() => { setCreateModalOpen(false); setCreatedInfo(null); }}>
            {t('common.cancel')}
          </Button>,
        ] : undefined}
        onOk={createdInfo ? undefined : handleCreateAccount}
        confirmLoading={creating}
        destroyOnHidden
      >
        {createdInfo ? (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: '#10B981' }}>
              {t('settings.account_created')}
            </div>
            <div style={{ marginBottom: 8 }}><b>Email:</b> {createdInfo.email}</div>
            <div style={{ marginBottom: 16 }}>
              <b>{t('settings.first_login_code')}:</b>
              <Tag
                color="green"
                style={{ fontSize: 18, padding: '4px 12px', marginLeft: 8, cursor: 'pointer' }}
                onClick={copyInviteCode}
              >
                {createdInfo.inviteCode} <CopyOutlined />
              </Tag>
            </div>
            <Text type="secondary">{t('settings.give_code_hint')}</Text>
          </div>
        ) : (
          <Form form={createForm} layout="vertical" initialValues={{ role: 'staff' }}>
            <Form.Item label={t('auth.email')} name="email" rules={[{ required: true, type: 'email' }]}>
              <Input />
            </Form.Item>
            <Form.Item label={t('auth.password')} name="password" rules={[{ required: true, min: 6 }]}>
              <Input.Password />
            </Form.Item>
            <Form.Item label={t('auth.full_name')} name="fullName" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item label={t('settings.role')} name="role">
              <Select
                options={roles.map((r) => ({
                  value: r.name,
                  label: (
                    <Space size={4}>
                      {ICON_MAP[r.icon] || <UserOutlined />}
                      <span>{r.display_name}</span>
                    </Space>
                  ),
                }))}
              />
            </Form.Item>
          </Form>
        )}
      </Modal>

      <Modal
        title={`${t('settings.change_password')} — ${pwModalMember?.full_name || pwModalMember?.email || ''}`}
        open={!!pwModalMember}
        onCancel={() => { setPwModalMember(null); pwForm.resetFields(); }}
        onOk={handleAdminChangePw}
        confirmLoading={changingPw}
        destroyOnHidden
      >
        <Form form={pwForm} layout="vertical">
          <Form.Item
            label={t('settings.new_password')}
            name="new_password"
            rules={[{ required: true, min: 6 }]}
          >
            <Input.Password />
          </Form.Item>
          <Form.Item
            label={t('settings.confirm_password')}
            name="confirm_password"
            rules={[{ required: true, min: 6 }]}
          >
            <Input.Password />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
