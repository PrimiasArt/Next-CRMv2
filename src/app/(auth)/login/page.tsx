'use client';

import { useState, useMemo } from 'react';
import { Card, Form, Input, Button, Typography, Space, App, Modal } from 'antd';
import { MailOutlined, LockOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { useAuth } from '@/hooks/useAuth';
import { useLocale } from '@/hooks/useLocale';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@/lib/supabase/client';
import Link from 'next/link';

const { Title, Text } = Typography;

export default function LoginPage() {
  const { signIn } = useAuth();
  const { t } = useLocale();
  const router = useRouter();
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [verifyModal, setVerifyModal] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const supabase = useMemo(() => createBrowserClient(), []);

  const onFinish = async (values: { email: string; password: string }) => {
    setLoading(true);
    const { error } = await signIn(values.email, values.password);
    if (error) {
      message.error(error);
      setLoading(false);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/dashboard');
      return;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('invite_code')
      .eq('id', user.id)
      .single();

    if (profile?.invite_code) {
      setPendingUserId(user.id);
      setVerifyModal(true);
      setLoading(false);
    } else {
      router.push('/dashboard');
    }
  };

  const handleVerify = async (values: { code: string }) => {
    if (!pendingUserId) return;
    setVerifying(true);

    const { data: profile } = await supabase
      .from('profiles')
      .select('invite_code')
      .eq('id', pendingUserId)
      .single();

    if (profile?.invite_code?.toUpperCase() === values.code.toUpperCase()) {
      await supabase
        .from('profiles')
        .update({ invite_code: null })
        .eq('id', pendingUserId);

      setVerifyModal(false);
      router.push('/dashboard');
    } else {
      message.error(t('settings.invalid_code'));
    }
    setVerifying(false);
  };

  return (
    <>
      <Card className="glass-auth" style={{ width: 420, maxWidth: '90vw' }} variant="borderless">
        <Space orientation="vertical" size="large" style={{ width: '100%' }}>
          <div style={{ textAlign: 'center' }}>
            <Title level={2} style={{ marginBottom: 4 }}>{t('auth.welcome')}</Title>
            <Text type="secondary">{t('auth.welcome_sub')}</Text>
          </div>

          <Form layout="vertical" onFinish={onFinish} size="large">
            <Form.Item name="email" rules={[{ required: true, type: 'email' }]}>
              <Input prefix={<MailOutlined />} placeholder={t('auth.email')} />
            </Form.Item>
            <Form.Item name="password" rules={[{ required: true, min: 6 }]}>
              <Input.Password prefix={<LockOutlined />} placeholder={t('auth.password')} />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={loading} block>
                {t('auth.login')}
              </Button>
            </Form.Item>
          </Form>

          <Text style={{ textAlign: 'center', display: 'block' }}>
            {t('auth.no_account')} <Link href="/register">{t('auth.register')}</Link>
          </Text>
        </Space>
      </Card>

      <Modal
        open={verifyModal}
        closable={false}
        footer={null}
        destroyOnHidden
      >
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <SafetyCertificateOutlined style={{ fontSize: 48, color: '#10B981' }} />
          <Title level={4} style={{ marginTop: 12 }}>{t('settings.first_login_verify')}</Title>
          <Text type="secondary">{t('settings.enter_invite_code')}</Text>
        </div>
        <Form layout="vertical" onFinish={handleVerify}>
          <Form.Item name="code" rules={[{ required: true }]}>
            <Input
              size="large"
              placeholder={t('auth.invite_code')}
              style={{ textAlign: 'center', fontSize: 20, letterSpacing: 4 }}
            />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={verifying} block size="large">
              {t('settings.verify_code')}
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
