const required = (name, fallback) => {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const nodeEnv = process.env.NODE_ENV ?? 'development';

export const env = {
  nodeEnv,
  isProduction: nodeEnv === 'production',
  isTest: nodeEnv === 'test',
  port: Number(process.env.PORT ?? 5000),
  mongoUri: process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27017/sunucampus',
  // A dev-only fallback keeps local setup simple; production must set a real secret.
  jwtSecret: nodeEnv === 'production' ? required('JWT_SECRET') : (process.env.JWT_SECRET ?? 'dev-only-insecure-secret'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
};

// Email domains that earn the verified (blue tick) badge once the student confirms the address.
env.verifiedEmailDomains = (process.env.VERIFIED_EMAIL_DOMAINS ?? 'utg.edu.gm')
  .split(',')
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

// Outgoing email. Without SMTP_HOST, verification codes are written to the server log instead.
env.smtp = {
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT ?? 587),
  user: process.env.SMTP_USER,
  pass: process.env.SMTP_PASS,
  from: process.env.MAIL_FROM ?? 'SunuCampus <no-reply@sunucampus.local>',
};

// Optional comma-separated list, e.g. "utg.edu.gm". Empty means any domain may register.
env.allowedEmailDomains = (process.env.ALLOWED_EMAIL_DOMAINS ?? '')
  .split(',')
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);
