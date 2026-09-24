'use client';

import { Tabs } from 'antd';
import { UserOutlined, TeamOutlined, ShopOutlined, HomeOutlined, AuditOutlined, ApiOutlined, DollarOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { PageHeader } from '@/components/shared/PageHeader';
import { ProfileCard } from '@/components/settings/ProfileCard';
import { TeamTable } from '@/components/settings/TeamTable';
import { InviteSection } from '@/components/settings/InviteSection';
import { ChannelSettings } from '@/components/settings/ChannelSettings';
import { WarehouseSettings } from '@/components/settings/WarehouseSettings';
import { AuditLogTab } from '@/components/settings/AuditLogTab';
import { ApiIntegrationSettings } from '@/components/settings/ApiIntegrationSettings';
import { CurrencySettings } from '@/components/settings/CurrencySettings';
import { RolePermissionTab } from '@/components/settings/RolePermissionTab';
import { useLocale } from '@/hooks/useLocale';
import { useRBAC } from '@/hooks/useRBAC';
import { useTeam } from '@/hooks/useTeam';
import { useChannels } from '@/hooks/useChannels';
import { useWarehouses } from '@/hooks/useWarehouses';
import { useRoles } from '@/hooks/useRoles';

export default function SettingsPage() {
  const { t } = useLocale();
  const { isAdmin, canManageWarehouse } = useRBAC();
  const team = useTeam();
  const ch = useChannels();
  const wh = useWarehouses();
  const { roles } = useRoles();

  const items = [
    {
      key: 'profile',
      label: t('settings.profile'),
      icon: <UserOutlined />,
      children: <ProfileCard />,
    },
    ...(isAdmin ? [
      {
        key: 'team',
        label: t('settings.team'),
        icon: <TeamOutlined />,
        children: (
          <>
            <TeamTable
              members={team.members}
              loading={team.loading}
              roles={roles}
              onChangeRole={team.changeRole}
              onRemove={team.remove}
              onRefresh={team.refresh}
            />
            <InviteSection
              invites={team.invites}
              roles={roles}
              onCreateInvite={team.createInvite}
              onDeleteInvite={team.removeInvite}
            />
          </>
        ),
      },
      {
        key: 'roles',
        label: t('role.title'),
        icon: <SafetyCertificateOutlined />,
        children: <RolePermissionTab />,
      },
      {
        key: 'channels',
        label: t('channels.title'),
        icon: <ShopOutlined />,
        children: (
          <ChannelSettings
            channelTypes={ch.channelTypes}
            channels={ch.channels}
            loading={ch.loading}
            onAddType={ch.addChannelType}
            onEditType={ch.editChannelType}
            onDeleteType={ch.removeChannelType}
            onAddChannel={ch.addChannel}
            onEditChannel={ch.editChannel}
            onDeleteChannel={ch.removeChannel}
          />
        ),
      },
      {
        key: 'api',
        label: t('api.title'),
        icon: <ApiOutlined />,
        children: <ApiIntegrationSettings />,
      },
      {
        key: 'currency',
        label: t('currency.title'),
        icon: <DollarOutlined />,
        children: <CurrencySettings />,
      },
      {
        key: 'audit',
        label: t('audit.title'),
        icon: <AuditOutlined />,
        children: <AuditLogTab />,
      },
    ] : []),
    ...(canManageWarehouse ? [
      {
        key: 'warehouses',
        label: t('warehouse.title'),
        icon: <HomeOutlined />,
        children: (
          <WarehouseSettings
            warehouses={wh.warehouses}
            loading={wh.loading}
            onAdd={wh.add}
            onEdit={wh.edit}
            onDelete={wh.remove}
          />
        ),
      },
    ] : []),
  ];

  return (
    <>
      <PageHeader title={t('sidebar.settings')} />
      <Tabs items={items} />
    </>
  );
}
