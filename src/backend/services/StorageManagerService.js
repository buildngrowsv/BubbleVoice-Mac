/**
 * STORAGE MANAGER SERVICE
 * 
 * **Purpose**: Manages user-selected folder for all BubbleVoice data
 * 
 * **What It Handles**:
 * - User folder selection on first launch
 * - Folder path persistence
 * - Directory structure creation
 * - File path resolution
 * - Data migration
 * 
 * **Why This Exists**:
 * Users should control where their data is stored. This service ensures
 * all conversations, artifacts, and files go to the user-selected folder.
 * 
 * **Product Context**:
 * Privacy and control are important. Users want their personal AI data
 * stored where they choose, not hidden in app data folders.
 * 
 * **Technical Approach**:
 * - Folder path stored in app settings
 * - Creates standard directory structure
 * - All services use this as root path
 * - Supports migration to new folder
 * 
 * **Directory Structure**:
 * ```
 * [User Selected Folder]/
 *   ├── conversations/
 *   │   ├── conv_123456/
 *   │   │   ├── conversation.md
 *   │   │   ├── user_inputs.md
 *   │   │   ├── conversation_ai_notes.md
 *   │   │   ├── conversation_summary.md
 *   │   │   └── artifacts/
 *   │   │       ├── artifact_001.html
 *   │   │       ├── artifact_001.json
 *   │   │       └── _INDEX.md
 *   │   └── conv_789012/
 *   │       └── ...
 *   ├── life_areas/
 *   │   ├── Family/
 *   │   │   ├── Kids/
 *   │   │   │   └── Emma's Reading/
 *   │   │   │       ├── AREA.md
 *   │   │   │       └── entries/
 *   │   │   │           ├── entry_001.md
 *   │   │   │           └── entry_002.md
 *   │   └── Work/
 *   ├── config/
 *   │   ├── prompts.json
 *   │   └── settings.json
 *   └── database/
 *       └── bubblevoice.db
 * ```
 * 
 * **Created**: 2026-01-25
 * **Part of**: Persistent Storage & User Folder Management
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

class StorageManagerService {
    /**
     * CONSTRUCTOR
     * 
     * @param {string} defaultPath - Default path if user hasn't selected one
     */
    constructor(defaultPath) {
        this.defaultPath = defaultPath;
        this.userSelectedPath = null;
        this.settingsPath = path.join(defaultPath, 'config', 'settings.json');
        
        console.log('[StorageManagerService] Initialized');
    }
    
    /**
     * INITIALIZE
     * 
     * Loads saved folder path or prompts user to select one.
     * 
     * @returns {Promise<string>} The storage root path
     */
    async initialize() {
        try {
            // Try to load saved path
            const savedPath = await this.loadSavedPath();
            
            if (savedPath && await this.validatePath(savedPath)) {
                this.userSelectedPath = savedPath;
                console.log(`[StorageManagerService] Using saved path: ${savedPath}`);
            } else {
                // Use default path
                this.userSelectedPath = this.defaultPath;
                console.log(`[StorageManagerService] Using default path: ${this.defaultPath}`);
            }
            
            // Create directory structure
            await this.createDirectoryStructure();
            
            return this.userSelectedPath;
            
        } catch (error) {
            console.error('[StorageManagerService] Initialization failed:', error);
            throw error;
        }
    }
    
    /**
     * LOAD SAVED PATH
     * 
     * Loads the user-selected folder path from settings.
     * 
     * @returns {Promise<string|null>} Saved path or null
     */
    async loadSavedPath() {
        try {
            // Ensure settings file exists
            const settingsDir = path.dirname(this.settingsPath);
            if (!fsSync.existsSync(settingsDir)) {
                await fs.mkdir(settingsDir, { recursive: true });
            }
            
            if (!fsSync.existsSync(this.settingsPath)) {
                return null;
            }
            
            const settingsData = await fs.readFile(this.settingsPath, 'utf8');
            const settings = JSON.parse(settingsData);
            
            return settings.storageFolder || null;
            
        } catch (error) {
            console.error('[StorageManagerService] Failed to load saved path:', error);
            return null;
        }
    }
    
    /**
     * SAVE PATH
     * 
     * Saves the user-selected folder path to settings.
     * 
     * @param {string} folderPath - Path to save
     */
    async savePath(folderPath) {
        try {
            const settingsDir = path.dirname(this.settingsPath);
            if (!fsSync.existsSync(settingsDir)) {
                await fs.mkdir(settingsDir, { recursive: true });
            }
            
            // Load existing settings or create new
            let settings = {};
            if (fsSync.existsSync(this.settingsPath)) {
                const settingsData = await fs.readFile(this.settingsPath, 'utf8');
                settings = JSON.parse(settingsData);
            }
            
            // Update storage folder
            settings.storageFolder = folderPath;
            settings.lastUpdated = Date.now();
            
            // Save
            await fs.writeFile(this.settingsPath, JSON.stringify(settings, null, 2));
            
            console.log(`[StorageManagerService] Saved path: ${folderPath}`);
            
        } catch (error) {
            console.error('[StorageManagerService] Failed to save path:', error);
            throw error;
        }
    }
    
    /**
     * VALIDATE PATH
     * 
     * Checks if a path is valid and accessible.
     * 
     * @param {string} folderPath - Path to validate
     * @returns {Promise<boolean>} True if valid
     */
    async validatePath(folderPath) {
        try {
            await fs.access(folderPath, fsSync.constants.R_OK | fsSync.constants.W_OK);
            return true;
        } catch (error) {
            return false;
        }
    }
    
    /**
     * CREATE DIRECTORY STRUCTURE
     * 
     * Creates the standard BubbleVoice directory structure.
     */
    async createDirectoryStructure() {
        const root = this.userSelectedPath;
        
        const directories = [
            'conversations',
            'life_areas',
            'config',
            'database',
            'exports',
            'backups'
        ];
        
        console.log('[StorageManagerService] Creating directory structure...');
        
        for (const dir of directories) {
            const dirPath = path.join(root, dir);
            if (!fsSync.existsSync(dirPath)) {
                await fs.mkdir(dirPath, { recursive: true });
                console.log(`  ✅ Created: ${dir}/`);
            }
        }
        
        console.log('[StorageManagerService] Directory structure ready');
    }
    
    /**
     * GET PATH
     * 
     * Returns the full path for a specific data type.
     * 
     * @param {string} type - Type: 'conversations', 'life_areas', 'config', 'database'
     * @returns {string} Full path
     */
    getPath(type) {
        return path.join(this.userSelectedPath, type);
    }
    
    /**
     * GET CONVERSATION PATH
     * 
     * Returns the path for a specific conversation.
     * 
     * @param {string} conversationId - Conversation ID
     * @returns {string} Conversation folder path
     */
    getConversationPath(conversationId) {
        return path.join(this.userSelectedPath, 'conversations', conversationId);
    }
    
    /**
     * GET LIFE AREA PATH
     * 
     * Returns the path for a specific life area.
     * 
     * @param {string} areaPath - Area path (e.g., "Family/Kids/Emma's Reading")
     * @returns {string} Life area folder path
     */
    getLifeAreaPath(areaPath) {
        return path.join(this.userSelectedPath, 'life_areas', areaPath);
    }
    
    /**
     * GET DATABASE PATH
     * 
     * Returns the path for the SQLite database.
     * 
     * @returns {string} Database file path
     */
    getDatabasePath() {
        return path.join(this.userSelectedPath, 'database', 'bubblevoice.db');
    }
    
    /**
     * SET USER FOLDER
     * 
     * Changes the user-selected folder and migrates data.
     * 
     * @param {string} newFolderPath - New folder path
     * @returns {Promise<Object>} Migration result
     */
    async setUserFolder(newFolderPath) {
        try {
            console.log(`[StorageManagerService] Changing folder to: ${newFolderPath}`);
            
            // Validate new path
            if (!await this.validatePath(newFolderPath)) {
                throw new Error('Invalid or inaccessible folder path');
            }
            
            const oldPath = this.userSelectedPath;
            this.userSelectedPath = newFolderPath;
            
            // Create directory structure in new location
            await this.createDirectoryStructure();
            
            // Save new path
            await this.savePath(newFolderPath);
            
            console.log('[StorageManagerService] Folder changed successfully');
            
            return {
                success: true,
                oldPath,
                newPath: newFolderPath,
                migrationNeeded: oldPath !== this.defaultPath
            };
            
        } catch (error) {
            console.error('[StorageManagerService] Failed to change folder:', error);
            throw error;
        }
    }
    
    /**
     * GET STORAGE INFO
     * 
     * Returns information about current storage.
     * 
     * @returns {Promise<Object>} Storage info
     */
    async getStorageInfo() {
        try {
            const root = this.userSelectedPath;
            
            // Count conversations
            const conversationsDir = path.join(root, 'conversations');
            let conversationCount = 0;
            if (fsSync.existsSync(conversationsDir)) {
                const dirs = await fs.readdir(conversationsDir);
                conversationCount = dirs.filter(d => d.startsWith('conv_')).length;
            }
            
            // Count life areas (recursive)
            const lifeAreasDir = path.join(root, 'life_areas');
            let lifeAreaCount = 0;
            if (fsSync.existsSync(lifeAreasDir)) {
                lifeAreaCount = await this.countLifeAreas(lifeAreasDir);
            }
            
            // Get database size
            const dbPath = this.getDatabasePath();
            let dbSize = 0;
            if (fsSync.existsSync(dbPath)) {
                const stats = await fs.stat(dbPath);
                dbSize = stats.size;
            }
            
            // Calculate total size
            const totalSize = await this.calculateFolderSize(root);
            
            return {
                rootPath: root,
                conversationCount,
                lifeAreaCount,
                databaseSize: this.formatBytes(dbSize),
                totalSize: this.formatBytes(totalSize),
                isDefaultLocation: root === this.defaultPath
            };
            
        } catch (error) {
            console.error('[StorageManagerService] Failed to get storage info:', error);
            throw error;
        }
    }
    
    /**
     * COUNT LIFE AREAS
     * 
     * Recursively counts life area folders.
     */
    async countLifeAreas(dir) {
        let count = 0;
        
        try {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const entryPath = path.join(dir, entry.name);
                    const areaFile = path.join(entryPath, 'AREA.md');
                    
                    if (fsSync.existsSync(areaFile)) {
                        count++;
                    }
                    
                    // Recurse into subdirectories
                    count += await this.countLifeAreas(entryPath);
                }
            }
        } catch (error) {
            // Ignore errors
        }
        
        return count;
    }
    
    /**
     * CALCULATE FOLDER SIZE
     * 
     * Calculates total size of a folder recursively.
     */
    async calculateFolderSize(dir) {
        let totalSize = 0;
        
        try {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            
            for (const entry of entries) {
                const entryPath = path.join(dir, entry.name);
                
                if (entry.isDirectory()) {
                    totalSize += await this.calculateFolderSize(entryPath);
                } else {
                    const stats = await fs.stat(entryPath);
                    totalSize += stats.size;
                }
            }
        } catch (error) {
            // Ignore errors
        }
        
        return totalSize;
    }
    
    /**
     * FORMAT BYTES
     * 
     * Formats bytes into human-readable string.
     */
    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

module.exports = StorageManagerService;
