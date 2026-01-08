
import dotenv from 'dotenv';
dotenv.config();

export default {
    JWT_SECRET: process.env.JWT_SECRET,

    JWT_ALGORITHM: process.env.JWT_ALGORITHM || 'HS256',

    // Token Lifetimes
    JWT_TTL_SECONDS: parseInt(process.env.JWT_TTL_SECONDS || '900', 10), // 15 Minutes
    REFRESH_TTL_SECONDS: parseInt(process.env.REFRESH_TTL_SECONDS || '604800', 10), // 7 Days

    SQL: {
        user: process.env.SQL_USER,
        password: process.env.SQL_PASSWORD,
        server: process.env.SQL_SERVER,
        database: process.env.SQL_DATABASE,
        options: {
            encrypt: false,
            trustServerCertificate: true
        }
    }
};
