/**
 * Maps SQL Server errors to appropriate HTTP status codes and messages.
 * 
 * Priority:
 * 1. Dynamic Prefix (e.g. "402: Insufficient Funds")
 * 2. Standard SQL Error Numbers (e.g. 2627 -> 409)
 * 3. Keyword Matching (e.g. "already inside" -> 409)
 * 4. Custom SP Errors (Error 50000) -> 400 Bad Request
 * 5. Default -> 500 Internal Server Error
 * 
 * @param {Error} error - The error object caught from SQL execution
 * @returns {object} { statusCode, message }
 */
export const mapSqlErrorToStatus = (error) => {
    // Unpack the real SQL error number if hidden by driver
    const sqlErrorNumber = error.originalError?.info?.number || error.number;
    let msg = error.message || "Unknown Database Error";

    // ---------------------------------------------------------
    // 1. DYNAMIC STATUS EXTRACTION
    // Support "XXX: Message" pattern (e.g., "402: Payment Required")
    // ---------------------------------------------------------
    const dynamicMatch = msg.match(/^(\d{3}):\s*(.+)/);
    if (dynamicMatch) {
        return {
            statusCode: parseInt(dynamicMatch[1], 10),
            message: dynamicMatch[2]
        };
    }

    // ---------------------------------------------------------
    // 2. STANDARD SQL ERROR NUMBERS
    // ---------------------------------------------------------
    // 2627: Violation of PRIMARY KEY constraint
    // 2601: Cannot insert duplicate key row ... with unique index
    // 547:  The INSERT statement conflicted with the FOREIGN KEY constraint
    if (sqlErrorNumber === 2627 || sqlErrorNumber === 2601 || sqlErrorNumber === 547) {
        return { statusCode: 409, message: msg };
    }

    // 515: Cannot insert the value NULL into column
    // 8152: String or binary data would be truncated
    // 201: Procedure expects parameter '@name' of type 'type'.
    // 245: Conversion failed when converting the varchar value...
    // 8114: Error converting data type...
    if ([515, 8152, 201, 245, 8114].includes(sqlErrorNumber)) {
        return { statusCode: 400, message: msg };
    }

    // ---------------------------------------------------------
    // 3. KEYWORD MATCHING (Fallback & Specific Business Logic)
    // ---------------------------------------------------------
    const lowerMsg = msg.toLowerCase();

    // 409 Conflict
    if (lowerMsg.includes("already inside") ||
        lowerMsg.includes("conflict") ||
        lowerMsg.includes("already exists") ||
        lowerMsg.includes("duplicate")) {
        return { statusCode: 409, message: msg };
    }

    // 404 Not Found
    if (lowerMsg.includes("not found") ||
        lowerMsg.includes("does not exist")) {
        return { statusCode: 404, message: msg };
    }

    // 400 Bad Request (Text fallback)
    if (lowerMsg.includes("expects parameter") ||
        lowerMsg.includes("parameter") ||
        lowerMsg.includes("not supplied") ||
        lowerMsg.includes("missing") ||
        lowerMsg.includes("required") ||
        lowerMsg.includes("invalid") ||
        lowerMsg.includes("convert") ||
        lowerMsg.includes("truncated")) {
        return { statusCode: 400, message: msg };
    }

    // ---------------------------------------------------------
    // 4. CATCH-ALL FOR CUSTOM SP ERRORS (Error 50000)
    // If we haven't matched a specific keyword above, but it is 
    // a custom RAISERROR (50000), it's likely a validation error.
    // ---------------------------------------------------------
    if (sqlErrorNumber === 50000) {
        return { statusCode: 400, message: msg };
    }

    // ---------------------------------------------------------
    // 5. DEFAULT SERVER ERROR
    // ---------------------------------------------------------
    return { statusCode: 500, message: msg };
};
