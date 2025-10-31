import { format } from 'date-fns';
import { v4 as uuid } from 'uuid';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the current module's directory path
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logEvents = async (message, logName) => {
    const dateTime = `${format(new Date(), 'yyyyMMdd\tHH:mm:ss')}`;
    const logItem = `${dateTime}\t${uuid()}\t${message}\n`;

    try {
        const logsDir = path.join(__dirname, '../logs');
        
        if (!fs.existsSync(logsDir)) {
            await fsPromises.mkdir(logsDir, { recursive: true });
        }

        await fsPromises.appendFile(path.join(logsDir, logName), logItem);
    } catch (err) {
        console.error('Logging error:', err);
    }
};

const logger = (req, res, next) => {
    logEvents(`${req.method}\t${req.headers.origin}\t${req.url}`, 'reqLog.txt')
        .catch(err => console.error('Failed to log request:', err));
    console.log(`${req.method} ${req.path}`);
    next();
};

export default logger;