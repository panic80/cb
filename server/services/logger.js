import fs from 'fs';
import { promises as fsPromises } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ChatLogger {
    constructor() {
        this.logFile = path.join(__dirname, '..', 'logs', 'chat.log');
        this.logDir = path.join(__dirname, '..', 'logs');
        this.queue = [];
        this.isProcessing = false;
        this.maxQueueSize = 1000;
        console.log('Logger initialized with log file:', this.logFile);
        console.log('Logger initialized with log directory:', this.logDir);
        this.initializeLogger();
    }

    initializeLogger() {
        try {
            fs.mkdirSync(this.logDir, { recursive: true });
            if (!fs.existsSync(this.logFile)) {
                fs.writeFileSync(this.logFile, '');
            }
            console.log('Logger initialized successfully'); // Debug log
        } catch (error) {
            console.error('Failed to initialize logger:', error);
            throw error;
        }
    }

    formatLogEntry(logData) {
        return `${logData.timestamp} | Question: ${logData.question} | Answer: ${logData.answer}\n`;
    }

    async processQueue() {
        if (this.isProcessing || this.queue.length === 0) return;

        this.isProcessing = true;
        const batchSize = Math.min(100, this.queue.length);
        const batch = this.queue.slice(0, batchSize);

        try {
            console.log('Processing log batch:', batch); // Debug log
            const logContent = batch.map(entry => this.formatLogEntry(entry)).join('');
            console.log('Writing log content:', logContent); // Debug log
            await fsPromises.appendFile(this.logFile, logContent, 'utf8');
            this.queue.splice(0, batchSize);
            console.log('Successfully wrote to log file'); // Debug log
        } catch (error) {
            console.error('Failed to write to log file:', error);
            // Keep failing entries in queue for retry
            await new Promise(resolve => setTimeout(resolve, 1000));
        } finally {
            this.isProcessing = false;
            if (this.queue.length > 0) {
                setImmediate(() => this.processQueue());
            }
        }
    }

    logChat(req, chatData) {
        try {
            const logEntry = this.formatLogEntry(chatData);
            console.log('Writing log entry:', logEntry); // Debug log
            console.log('Writing to log file:', this.logFile); // Debug log
            
            // Check if the log directory exists
            if (!fs.existsSync(this.logDir)) {
                console.log('Log directory does not exist, creating it...');
                fs.mkdirSync(this.logDir, { recursive: true });
            }
            
            // Check if the log file exists
            if (!fs.existsSync(this.logFile)) {
                console.log('Log file does not exist, creating it...');
                fs.writeFileSync(this.logFile, '');
            }
            
            fs.appendFileSync(this.logFile, logEntry, 'utf8');
            console.log('Successfully wrote to log file'); // Debug log
        } catch (error) {
            console.error('Failed to write to log file:', error);
        }
    }
    
    log(data) {
        // For backward compatibility, redirect to logChat
        this.logChat(null, data);
    }
}

// Create singleton instance
const chatLogger = new ChatLogger();
export default chatLogger;