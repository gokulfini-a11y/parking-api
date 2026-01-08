
import { jwtEncrypt, jwtDecrypt } from '../utils/cryptoUtil.js';
import config from '../config/config.js';

export const renewToken = async (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(400).json({ success: false, message: 'Refresh token required' });
        }

        // Decrypt and Verify Refresh Token
        // data contains the user object
        let userData;
        try {
            userData = jwtDecrypt(refreshToken);
        } catch (err) {
            return res.status(401).json({ success: false, message: 'Invalid or Expired Refresh Token' });
        }

        // Optional: Check if user is still active in DB (omitted for stateless efficiency unless strictly required)

        // Generate NEW Access Token (15 mins)
        // userData from refresh token is reused to create the new access token
        const { token: newToken, expiry_at: newExpiry } = jwtEncrypt(userData, config.JWT_TTL_SECONDS);

        return res.json({
            success: true,
            accessToken: newToken,
            accessExpiry: newExpiry
        });

    } catch (error) {
        // console.error("Token Renewal Error:", error);
        return res.status(500).json({ success: false, message: 'Token Renewal Failed' });
    }
};
