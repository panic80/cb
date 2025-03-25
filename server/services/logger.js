import fs from 'fs';
import { promises as fsPromises } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ChatLogger {
    constructor() {
        this.logFile = path.join(__dirname, '..', 'logs', 'chat.log');
        this.errorLogFile = path.join(__dirname, '..', 'logs', 'error.log');
        this.logDir = path.join(__dirname, '..', 'logs');
        this.queue = [];
        this.errorQueue = [];
        this.isProcessing = false;
        this.isProcessingErrors = false;
        this.maxQueueSize = 1000;
        
        this.initializeLogger();
    }

    initializeLogger() {
        try {
            fs.mkdirSync(this.logDir, { recursive: true });
            
            // Create log files if they don't exist
            if (!fs.existsSync(this.logFile)) {
                fs.writeFileSync(this.logFile, '');
            }
            
            if (!fs.existsSync(this.errorLogFile)) {
                fs.writeFileSync(this.errorLogFile, '');
            }
            
            console.log('Logger initialized successfully with log files:', {
                chat: this.logFile,
                error: this.errorLogFile,
                directory: this.logDir
            });
        } catch (error) {
            console.error('Failed to initialize logger:', error);
            throw error;
        }
    }

    formatLogEntry(logData) {
        return `${logData.timestamp} | Question: ${logData.question} | Answer: ${logData.answer}\n`;
    }
    
    formatErrorEntry(errorData) {
        const { timestamp, errorType, message, endpoint, userMessage, details, stack } = errorData;
        
        let entry = `${timestamp} | Type: ${errorType} | Endpoint: ${endpoint || 'N/A'} | Message: ${message}\n`;
        
        if (userMessage) {
            entry += `User Message: ${userMessage}\n`;
        }
        
        if (details) {
            entry += `Details: ${JSON.stringify(details)}\n`;
        }
        
        if (stack && process.env.NODE_ENV !== 'production') {
            entry += `Stack: ${stack}\n`;
        }
        
        entry += '-----------------------------------\n';
        return entry;
    }

    async processQueue() {
        if (this.isProcessing || this.queue.length === 0) return;

        this.isProcessing = true;
        const batchSize = Math.min(100, this.queue.length);
        const batch = this.queue.slice(0, batchSize);

        try {
            const logContent = batch.map(entry => this.formatLogEntry(entry)).join('');
            await fsPromises.appendFile(this.logFile, logContent, 'utf8');
            this.queue.splice(0, batchSize);
        } catch (error) {
            console.error('Failed to write to chat log file:', error);
            // Keep failing entries in queue for retry
            await new Promise(resolve => setTimeout(resolve, 1000));
        } finally {
            this.isProcessing = false;
            if (this.queue.length > 0) {
                setImmediate(() => this.processQueue());
            }
        }
    }
    
    async processErrorQueue() {
        if (this.isProcessingErrors || this.errorQueue.length === 0) return;

        this.isProcessingErrors = true;
        const batchSize = Math.min(50, this.errorQueue.length);
        const batch = this.errorQueue.slice(0, batchSize);

        try {
            const logContent = batch.map(entry => this.formatErrorEntry(entry)).join('');
            await fsPromises.appendFile(this.errorLogFile, logContent, 'utf8');
            this.errorQueue.splice(0, batchSize);
        } catch (error) {
            console.error('Failed to write to error log file:', error);
            // Keep failing entries in queue for retry
            await new Promise(resolve => setTimeout(resolve, 1000));
        } finally {
            this.isProcessingErrors = false;
            if (this.errorQueue.length > 0) {
                setImmediate(() => this.processErrorQueue());
            }
        }
    }

    logChat(req, chatData) {
        try {
            // Ensure log directory exists
            if (!fs.existsSync(this.logDir)) {
                fs.mkdirSync(this.logDir, { recursive: true });
            }
            
            // Ensure log file exists
            if (!fs.existsSync(this.logFile)) {
                fs.writeFileSync(this.logFile, '');
            }
            
            const logEntry = this.formatLogEntry(chatData);
            fs.appendFileSync(this.logFile, logEntry, 'utf8');
        } catch (error) {
            console.error('Failed to write to chat log file:', error);
            // Try to queue it for later processing
            if (this.queue.length < this.maxQueueSize) {
                this.queue.push(chatData);
                this.processQueue().catch(err => console.error('Error processing chat queue:', err));
            }
        }
    }
    
    logError(errorData) {
        try {
            // Ensure error data has all required fields
            const data = {
                timestamp: errorData.timestamp || new Date().toISOString(),
                errorType: errorData.errorType || 'UNKNOWN',
                message: errorData.message || 'An unknown error occurred',
                endpoint: errorData.endpoint,
                userMessage: errorData.userMessage,
                details: errorData.details,
                stack: errorData.stack
            };
            
            // Ensure log directory exists
            if (!fs.existsSync(this.logDir)) {
                fs.mkdirSync(this.logDir, { recursive: true });
            }
            
            // Ensure error log file exists
            if (!fs.existsSync(this.errorLogFile)) {
                fs.writeFileSync(this.errorLogFile, '');
            }
            
            const errorEntry = this.formatErrorEntry(data);
            fs.appendFileSync(this.errorLogFile, errorEntry, 'utf8');
            
            // Also log to console in development
            if (process.env.NODE_ENV !== 'production') {
                console.error('API Error:', data);
            }
        } catch (error) {
            console.error('Failed to write to error log file:', error);
            // Try to queue it for later processing
            if (this.errorQueue.length < this.maxQueueSize) {
                this.errorQueue.push(errorData);
                this.processErrorQueue().catch(err => console.error('Error processing error queue:', err));
            }
        }
    }
    
    // Check log file existence and create if needed
    ensureLogFiles() {
        try {
            if (!fs.existsSync(this.logDir)) {
                fs.mkdirSync(this.logDir, { recursive: true });
            }
            
            if (!fs.existsSync(this.logFile)) {
                fs.writeFileSync(this.logFile, '');
            }
            
            if (!fs.existsSync(this.errorLogFile)) {
                fs.writeFileSync(this.errorLogFile, '');
            }
            
            return true;
        } catch (error) {
            console.error('Failed to ensure log files exist:', error);
            return false;
        }
    }
    
    // Method to get error statistics - useful for monitoring
    async getErrorStats(timeRange = '24h') {
        try {
            if (!fs.existsSync(this.errorLogFile)) {
                return { total: 0, byType: {} };
            }
            
            const content = await fsPromises.readFile(this.errorLogFile, 'utf8');
            const lines = content.split('\n');
            const stats = { total: 0, byType: {} };
            
            // Calculate timestamp cutoff based on timeRange
            const now = new Date();
            let cutoff = new Date();
            if (timeRange === '24h') {
                cutoff.setDate(now.getDate() - 1);
            } else if (timeRange === '7d') {
                cutoff.setDate(now.getDate() - 7);
            } else if (timeRange === '1h') {
                cutoff.setHours(now.getHours() - 1);
            }
            
            // Parse error log to count occurrences
            for (const line of lines) {
                if (line.includes(' | Type: ')) {
                    // Parse timestamp and error type
                    const timestampMatch = line.match(/^([^|]+)/);
                    const typeMatch = line.match(/Type: ([^|]+)/);
                    
                    if (timestampMatch && typeMatch) {
                        const timestamp = new Date(timestampMatch[1].trim());
                        if (timestamp > cutoff) {
                            const type = typeMatch[1].trim();
                            stats.total++;
                            stats.byType[type] = (stats.byType[type] || 0) + 1;
                        }
                    }
                }
            }
            
            return stats;
        } catch (error) {
            console.error('Failed to get error statistics:', error);
            return { total: 0, byType: {} };
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