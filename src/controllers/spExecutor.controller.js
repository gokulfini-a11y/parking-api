//-----------------------------------------------------------
// UNIVERSAL SP EXECUTOR - Azure Functions Compatible
//-----------------------------------------------------------

import { poolPromise, sql } from "../db/db.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url'; // Required for path fix
import { jwtEncrypt } from "../utils/cryptoUtil.js";
import { mapSqlErrorToStatus } from "../utils/sqlErrorMapper.js";
import config from "../config/config.js";

// --- AZURE PATH FIX ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const routeMapPath = path.join(__dirname, "../config/routeMap.json");
const routeMap = JSON.parse(fs.readFileSync(routeMapPath, "utf-8"));

// Helper to preserve local time from SQL
const formatDateForResponse = (date) => {
  if (!(date instanceof Date)) return date;
  const pad = (n, width = 2) => String(n).padStart(width, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  const ms = pad(date.getMilliseconds(), 3);
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${ms}`;
};

// Helper to traverse and format data
const postProcessData = (data) => {
  if (Array.isArray(data)) {
    return data.map(item => postProcessData(item));
  } else if (data && typeof data === 'object' && !(data instanceof Date)) {
    const formatted = {};
    for (const key in data) {
      formatted[key] = postProcessData(data[key]);
    }
    return formatted;
  }
  else if (data instanceof Date) {
    return formatDateForResponse(data);
  }
  return data;
};

const getSqlType = (typeStr) => {
  switch (typeStr.toLowerCase()) {
    case 'int': return sql.Int;
    case 'bigint': return sql.BigInt;
    case 'varchar': return sql.VarChar;
    case 'nvarchar': return sql.NVarChar;
    case 'bit': return sql.Bit;
    case 'date': return sql.Date;
    case 'datetime': return sql.DateTime;
    case 'decimal': return sql.Decimal(10, 2);
    case 'float': return sql.Float;
    default: return sql.NVarChar;
  }
};

export const executeStoredProcedure = async (req, res) => {
  try {
    // 1. Identify which SP to run based on the route
    // FIX: Changed from req.route.path to req.path for Azure compatibility
    const currentPath = req.path; 
    const currentMethod = req.method;

    const matchedConfig = Object.values(routeMap).find(
      (r) => r.url === currentPath && r.method === currentMethod
    );

    if (!matchedConfig) {
      return res.status(404).json({
        success: false,
        message: "Route configuration not found"
      });
    }

    const procedure_name = matchedConfig.procedure;

    // 2. Extract parameters 
    let parameters = {};

    const injectUserKey = (params, user, key) => {
      if (user && user.user_id && Object.prototype.hasOwnProperty.call(params, key)) {
        params[key] = user.user_id;
      }
    };

    if (currentMethod === "GET" || currentMethod === "DELETE") {
      parameters = req.query;
      injectUserKey(parameters, req.user, 'created_by');
      injectUserKey(parameters, req.user, 'updated_by');
      injectUserKey(parameters, req.user, 'edited_by');
      injectUserKey(parameters, req.user, 'user_id');
      injectUserKey(parameters, req.user, 'last_edit_by');
    } else {
      parameters = req.body || {};
      if (parameters.parameters) {
        parameters = parameters.parameters;
      }
      injectUserKey(parameters, req.user, 'created_by');
      injectUserKey(parameters, req.user, 'updated_by');
      injectUserKey(parameters, req.user, 'edited_by');
      injectUserKey(parameters, req.user, 'user_id');
      injectUserKey(parameters, req.user, 'last_edit_by');
    }

    console.log(`[SP Executor] Running ${procedure_name} with params:`, parameters);

    const pool = await poolPromise;
    const request = pool.request();

    // Attach parameters
    for (const key in parameters) {
      let value = parameters[key];
      let type = sql.NVarChar;

      if (value === "null" || value === "") {
        value = null;
      }

      if (value !== undefined) {
        if (value === null) {
          type = sql.NVarChar;
        } else {
          if (typeof value === 'string' && !isNaN(value) && value.trim() !== '') {
            const hasLeadingZero = value.trim().length > 1 && value.trim().startsWith('0');
            if (!hasLeadingZero && Number.isInteger(Number(value))) {
              value = Number(value);
            }
          }

          switch (typeof value) {
            case 'number':
              if (Number.isInteger(value)) {
                if (value > 2147483647 || value < -2147483648) {
                  type = sql.BigInt;
                } else {
                  type = sql.Int;
                }
              } else {
                type = sql.Decimal(10, 2);
              }
              break;
            case 'boolean':
              type = sql.Bit;
              break;
            case 'string':
              type = sql.NVarChar;
              break;
            case 'object':
              if (value instanceof Date) {
                value = formatDateForResponse(value);
                type = sql.NVarChar;
              } else {
                value = JSON.stringify(value);
                type = sql.NVarChar;
              }
              break;
            default:
              type = sql.NVarChar;
          }
        }
        request.input(key, type, value);
      }
    }

    // Attach Output Parameters
    if (matchedConfig.outputParams) {
      for (const paramName in matchedConfig.outputParams) {
        const typeStr = matchedConfig.outputParams[paramName];
        request.output(paramName, getSqlType(typeStr));
      }
    }

    const result = await request.execute(procedure_name);

    let processedData = result.recordset || [];
    processedData = postProcessData(processedData);

    const responsePayload = {
      success: true,
      data: processedData,
      output: result.output || {}
    };

    if (procedure_name.startsWith('sp_s_') && !procedure_name.startsWith('sp_sa_')) {
      if (!processedData || (Array.isArray(processedData) && processedData.length === 0)) {
        return res.status(404).json({ success: false, message: "Data not found" });
      }
    }

    // JWT Injection for Login OTP
    if (procedure_name === 'sp_u_user_login_otp_verify') {
      if (responsePayload.data && responsePayload.data.length > 0) {
        const userData = responsePayload.data[0];
        try {
          const { token: accessToken, expiry_at: accessExpiry } = jwtEncrypt(userData, config.JWT_TTL_SECONDS);
          const { token: refreshToken, expiry_at: refreshExpiry } = jwtEncrypt(userData, config.REFRESH_TTL_SECONDS);

          responsePayload.accessToken = accessToken;
          responsePayload.accessExpiry = accessExpiry;
          responsePayload.refreshToken = refreshToken;
          responsePayload.refreshExpiry = refreshExpiry;
        } catch (jwtError) {
          console.error("JWT Error:", jwtError);
        }
      }
    }

    return res.json(responsePayload);

  } catch (error) {
    const { statusCode, message } = mapSqlErrorToStatus(error);
    return res.status(statusCode).json({
      success: false,
      message: message
    });
  }
};