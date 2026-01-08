import sql from "mssql";

const dbConfig = {
  user: process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,
  server: process.env.SQL_SERVER,
  database: process.env.SQL_DATABASE,
  options: {
    encrypt: true, // Set to true for Azure SQL
    trustServerCertificate: true,
    useUTC: false
  }
};

export const poolPromise = new sql.ConnectionPool(dbConfig)
  .connect()
  .then(pool => {
    // console.log("Connected to SQL Server");
    return pool;
  })
  .catch(err => {
    // console.log("Database Connection Failed!", err)
  });

export { sql };
