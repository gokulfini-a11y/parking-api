
import { jwtDecrypt, jwtEncrypt } from '../utils/cryptoUtil.js';
import { poolPromise, sql } from '../db/db.js';
import config from '../config/config.js';

export const authMiddleware = async (req, res, next) => {
    // 1. Skip Auth for Login/Refresh routes (Just in case it's applied globally, though we likely won't)
    if (req.path.includes('/login') || req.path.includes('/refresh-token')) {
        return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: 'Access Token Required' });
    }

    const token = authHeader.split(' ')[1];

    try {
        // 2. Decrypt Token (Checks Signature + Expiry)
        const userData = jwtDecrypt(token);
        const userId = userData.user_id || userData.userId; // Handle casing differences

        if (!userId) {
            return res.status(401).json({ success: false, message: 'Invalid Token Payload' });
        }

        // 3. STRICT DB CHECK: Is User Active?
        const pool = await poolPromise;
        const result = await pool.request()
            .input('user_id', sql.Int, userId) // FIXED: Type mismatch (NVarChar vs Int)
            .query('SELECT user_id, display_name, is_active, user_role FROM user_management WHERE user_id = @user_id'); // FIXED: Column name 'role' -> 'user_role'

        if (result.recordset.length === 0) {
            return res.status(401).json({ success: false, message: 'User not found' });
        }

        const userStatus = result.recordset[0];

        // 4. INSTANT BAN CHECK
        if (userStatus.is_active === false || userStatus.is_active === 0) { // Check both boolean and bit
            return res.status(403).json({ success: false, message: 'Account Deactivated. Please contact admin.' });
        }

        // 5. Inject Secure Data
        // req.body.user_id = userId; // REMOVED: Causes "Too many arguments" error in SPs that don't expect @user_id
        req.user = userStatus; // Attach full status for other controllers if needed

        // 6. AUTO-RENEWAL CHECK (REMOVED: Moved to Active Client-Side Request)
        // Client will explicitly call /auth/renew-token if needed.

        next();

    } catch (error) {
        console.error("Auth Middleware Error:", error.message);
        console.error("Token Part:", token.substring(0, 10) + "...");
        console.error("Secret Loaded?", !!config.JWT_SECRET);
        if (error.stack) console.error(error.stack);

        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ success: false, message: 'Token Expired' });
        }
        return res.status(401).json({ success: false, message: 'Invalid Token' });
    }
};
