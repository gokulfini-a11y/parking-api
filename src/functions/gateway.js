import { app } from '@azure/functions';
import { executeStoredProcedure } from '../controllers/spExecutor.controller.js';
import { renewToken } from '../controllers/token.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

app.http('gateway', {
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    authLevel: 'anonymous',
    route: '{*remainder}', // Matches /api/anything
    handler: async (request, context) => {
        const path = `/${request.params.remainder || ''}`;
        
        // 1. Simulate Express 'res' object
        let resStatus = 200;
        let resBody = {};
        const res = {
            status: (code) => { resStatus = code; return res; },
            json: (body) => { resBody = body; return res; }
        };

        // 2. Simulate Express 'req' object
        const req = {
            path: path,
            method: request.method,
            query: Object.fromEntries(new URL(request.url).searchParams),
            headers: Object.fromEntries(request.headers.entries()),
            user: null,
            // Only parse body for non-GET methods
            body: (request.method !== 'GET') ? await request.json().catch(() => ({})) : {}
        };

        try {
            // Manual Route: Token Renewal
            if (path === '/auth/renew-token' && request.method === 'POST') {
                await renewToken(req, res);
            } 
            // Automatic Routes: SP Executor with Auth Middleware
            else {
                await new Promise((resolve, reject) => {
                    authMiddleware(req, res, (err) => {
                        if (err) return reject(err);
                        executeStoredProcedure(req, res).then(resolve).catch(reject);
                    }).catch(reject);
                });
            }

            return { status: resStatus, jsonBody: resBody };
        } catch (error) {
            return { 
                status: error.status || 500, 
                jsonBody: { success: false, message: error.message || "Internal Server Error" } 
            };
        }
    }
});
