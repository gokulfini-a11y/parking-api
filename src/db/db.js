import sql from "mssql";

const dbConfig = {
  user: process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,
  server: process.env.SQL_SERVER,
  database: process.env.SQL_DATABASE,
  options: {
    encrypt: true, 
    trustServerCertificate: true,
    useUTC: false
  }
};

let pool = null;

// This function manages the connection
export const getPool = async () => {
  if (pool) return pool; // If already connected, reuse it

  try {
    console.log("Attempting to connect to DB...");
    pool = await new sql.ConnectionPool(dbConfig).connect();
    console.log("Connected to SQL Server");
    return pool;
  } catch (err) {
    console.error("Database Connection Failed!", err);
    pool = null; // Reset so we can try again on next request
    throw err;
  }
};

export { sql };
