import dotenv from 'dotenv';
dotenv.config();
export const config = {
    env: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '3000', 10),
    adminUsername: process.env.ADMIN_USERNAME || 'admin',
    adminPassword: process.env.ADMIN_PASSWORD || 'change-me-now',
    sessionSecret: process.env.SESSION_SECRET || 'please-change-this-super-secret',
    publicDomain: process.env.PUBLIC_DOMAIN || 'localhost'
};