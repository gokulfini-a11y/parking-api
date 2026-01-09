import { app } from '@azure/functions';
import { executeStoredProcedure } from '../controllers/spExecutor.controller.js';
import { renewToken } from '../controllers/token.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

app.http('gateway', {
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    authLevel: 'anonymous',
    route: '{*remainder}', // Note: Azure usually prefixes this with /api/
    handler: async (request, context) => {
        const path = `/${request.params.remainder || ''}`;
        
        let resStatus = 200;
        let resBody = {};
        const res = {
            status: (code) => { resStatus = code; return res; },
            json: (body) => { resBody = body; return res; }
        };

        const req = {
            path: path,
            method: request.method,
            query: Object.fromEntries(new URL(request.url).searchParams),
            headers: Object.fromEntries(request.headers.entries()),
            user: null,
            body: (request.method !== 'GET') ? await request.json().catch(() => ({})) : {}
        };

        try {
            // --- NEW: TEST ROUTE (No Database) ---
            if (path === '/health' || path === '/ping') {
                return { 
                    status: 200, 
                    jsonBody: { 
                        success: true, 
                        message: "Cloud Gateway is LIVE!", 
                        timestamp: new Date().toISOString() 
                    } 
                };
            }
            // -------------------------------------

            if (path === '/auth/renew-token' && request.method === 'POST') {
                await renewToken(req, res);
            } 
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
            context.error(`Error handling request: ${error.message}`); // Log error to Azure Console
            return { 
                status: error.status || 500, 
                jsonBody: { success: false, message: error.message || "Internal Server Error" } 
            };
        }
    }
});
