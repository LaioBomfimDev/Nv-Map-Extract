import {
  SUPERADMIN_EMAIL,
  formatDayBR,
  formatUserAgent,
  isMissingMigrationError,
  isSuperAdmRoute,
  isSuperAdminEmail,
  isSuperAdminSession,
  normalizePathname,
} from './superadmin';

describe('superadmin helpers', () => {
  test('reconhece apenas laiobomfimdev@gmail.com como superadmin', () => {
    expect(isSuperAdminEmail('laiobomfimdev@gmail.com')).toBe(true);
    expect(isSuperAdminEmail('  LAIOBOMFIMDEV@GMAIL.COM ')).toBe(true);
    expect(isSuperAdminEmail('adm1@teste.com')).toBe(false);
    expect(isSuperAdminEmail('')).toBe(false);
  });

  test('valida sessao de superadmin considerando perfil ativo', () => {
    const adminSession = { user: { email: SUPERADMIN_EMAIL } };
    const normalSession = { user: { email: 'user@teste.com' } };

    expect(isSuperAdminSession(adminSession, null)).toBe(true);
    expect(isSuperAdminSession(adminSession, { role: 'superadmin', is_active: true })).toBe(true);
    expect(isSuperAdminSession(adminSession, { role: 'user', is_active: true })).toBe(false);
    expect(isSuperAdminSession(adminSession, { role: 'superadmin', is_active: false })).toBe(false);
    expect(isSuperAdminSession(normalSession, { role: 'superadmin', is_active: true })).toBe(false);
  });

  test('normaliza e detecta rota /superadm com ou sem barra final', () => {
    expect(normalizePathname('/superadm/')).toBe('/superadm');
    expect(normalizePathname('/')).toBe('/');
    expect(isSuperAdmRoute('/superadm')).toBe(true);
    expect(isSuperAdmRoute('/superadm/')).toBe(true);
    expect(isSuperAdmRoute('/superadm/logs')).toBe(true);
    expect(isSuperAdmRoute('/')).toBe(false);
    expect(isSuperAdmRoute('/dashboard')).toBe(false);
  });

  test('identifica erros de migration ainda nao aplicada', () => {
    expect(isMissingMigrationError({ code: 'PGRST202' })).toBe(true);
    expect(isMissingMigrationError({ code: '42P01' })).toBe(true);
    expect(isMissingMigrationError({ message: 'Could not find the function public.get_my_profile' })).toBe(true);
    expect(isMissingMigrationError({ message: 'Invalid login credentials' })).toBe(false);
  });

  test('formata data YYYY-MM-DD em pt-BR e resume user-agent', () => {
    expect(formatDayBR('2026-11-10')).toBe('10/11/2026');
    expect(formatUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0')).toBe('Chrome · Windows');
    expect(formatUserAgent('Mozilla/5.0 (Windows NT 10.0) Edg/120.0')).toBe('Edge · Windows');
  });
});
