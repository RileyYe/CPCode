import * as vscode from 'vscode';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as https from 'https';
import * as http from 'http';

const execAsync = promisify(exec);

// 缓存接口
interface CacheEntry {
    value: string;
    timestamp: number;
}

// 缓存存储
const urlCache = new Map<string, CacheEntry>();

// 默认缓存超时时间 (秒)
const DEFAULT_CACHE_TIMEOUT = 600;

/**
 * 获取缓存超时时间 (毫秒)
 */
function getCacheTimeoutMs(): number {
    const config = vscode.workspace.getConfiguration('cpcode');
    const timeoutSeconds = config.get<number>('cacheTimeout', DEFAULT_CACHE_TIMEOUT);
    return timeoutSeconds * 1000;
}

/**
 * 清除所有缓存
 */
function clearCache(): void {
    urlCache.clear();
}

/**
 * 清除指定项目的缓存
 */
function clearCacheForProject(projectName: string): void {
    urlCache.delete(projectName);
}

// 语言标识符映射
const LANGUAGE_MAP: Record<string, string> = {
    'sol': 'solidity',
    'py': 'python',
    'js': 'javascript',
    'ts': 'typescript',
    'tsx': 'typescript',
    'jsx': 'javascript',
    'go': 'go',
    'rs': 'rust',
    'md': 'markdown',
    'json': 'json',
    'yaml': 'yaml',
    'yml': 'yaml',
    'sh': 'bash',
    'bash': 'bash',
    'zsh': 'bash',
    'css': 'css',
    'scss': 'scss',
    'html': 'html',
    'vue': 'vue',
    'java': 'java',
    'c': 'c',
    'cpp': 'cpp',
    'h': 'c',
    'hpp': 'cpp',
};

/**
 * 根据文件扩展名获取语言标识符
 */
function getLanguageIdentifier(filename: string): string {
    const ext = path.extname(filename).slice(1).toLowerCase();
    return LANGUAGE_MAP[ext] || ext;
}

/**
 * 发起 HTTP/HTTPS GET 请求
 */
function httpGet(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        
        client.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

/**
 * 获取 Git 仓库根目录
 */
async function getGitRoot(cwd: string): Promise<string | null> {
    try {
        const { stdout } = await execAsync('git rev-parse --show-toplevel', { cwd });
        return stdout.trim();
    } catch {
        return null;
    }
}

/**
 * 获取当前 commit hash
 */
async function getCommitHash(cwd: string): Promise<string | null> {
    try {
        const { stdout } = await execAsync('git rev-parse HEAD', { cwd });
        return stdout.trim();
    } catch {
        return null;
    }
}

/**
 * 获取 git remote URL 并转换为浏览器可访问的格式
 */
async function getGitRemoteUrl(cwd: string): Promise<string | null> {
    try {
        const { stdout } = await execAsync('git remote get-url origin', { cwd });
        let url = stdout.trim();
        
        // 去掉 .git 后缀
        if (url.endsWith('.git')) {
            url = url.slice(0, -4);
        }
        
        // SSH 格式转换为 HTTPS 格式
        // git@github.com:user/repo -> https://github.com/user/repo
        const sshMatch = url.match(/^git@([^:]+):(.+)$/);
        if (sshMatch) {
            url = `https://${sshMatch[1]}/${sshMatch[2]}`;
        }
        
        return url;
    } catch {
        return null;
    }
}

/**
 * 从 API 获取项目的原始 URL (带缓存)
 * 如果 apiEndpoint 为空，则获取本地 git remote URL
 */
async function getOriginalUrl(apiEndpoint: string | undefined | null, projectName: string, forceRefresh: boolean = false, gitRoot?: string): Promise<string | null> {
    // 检查缓存 (非强制刷新时)
    if (!forceRefresh) {
        const cached = urlCache.get(projectName);
        if (cached) {
            const now = Date.now();
            const timeoutMs = getCacheTimeoutMs();
            if (now - cached.timestamp < timeoutMs) {
                console.log(`使用缓存的 URL: ${projectName}`);
                return cached.value;
            }
            // 缓存已过期，删除
            urlCache.delete(projectName);
        }
    }

    // 如果 apiEndpoint 为空、undefined 或 null，获取本地 git remote URL
    if (!apiEndpoint) {
        if (!gitRoot) {
            console.error('获取本地 git remote URL 需要 gitRoot 参数');
            return null;
        }
        const remoteUrl = await getGitRemoteUrl(gitRoot);
        if (remoteUrl) {
            // 存入缓存
            urlCache.set(projectName, {
                value: remoteUrl,
                timestamp: Date.now()
            });
        }
        return remoteUrl;
    }

    try {
        const apiUrl = `${apiEndpoint}/${projectName}`;
        const response = await httpGet(apiUrl);
        const data = JSON.parse(response);
        
        if (data.original_url && data.original_url !== 'null') {
            // 存入缓存
            urlCache.set(projectName, {
                value: data.original_url,
                timestamp: Date.now()
            });
            return data.original_url;
        }
        return null;
    } catch (error) {
        console.error('API 请求失败:', error);
        return null;
    }
}

/**
 * 主要的复制代码链接功能
 * @param forceRefresh 是否强制刷新缓存
 */
async function copyCodeLink(forceRefresh: boolean = false) {
    const editor = vscode.window.activeTextEditor;
    
    if (!editor) {
        vscode.window.showErrorMessage('没有打开的编辑器');
        return;
    }

    const selection = editor.selection;
    if (selection.isEmpty) {
        vscode.window.showErrorMessage('请先选择一段代码');
        return;
    }

    const document = editor.document;
    const filePath = document.uri.fsPath;
    
    // 获取选中的代码
    const selectedText = document.getText(selection);
    
    // 获取行号 (VS Code 行号从 0 开始，需要 +1)
    const startLine = selection.start.line + 1;
    const endLine = selection.end.line + 1;
    
    // 获取工作目录
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    const cwd = workspaceFolder?.uri.fsPath || path.dirname(filePath);
    
    // 检查是否在 Git 仓库中
    const gitRoot = await getGitRoot(cwd);
    if (!gitRoot) {
        vscode.window.showErrorMessage('当前目录不是一个 Git 仓库');
        return;
    }
    
    // 获取项目名称和相对路径
    const projectName = path.basename(gitRoot);
    const relativePath = path.relative(gitRoot, filePath);
    const filename = path.basename(filePath);
    
    // 获取 commit hash
    const commitHash = await getCommitHash(gitRoot);
    if (!commitHash) {
        vscode.window.showErrorMessage('无法获取 Git commit hash');
        return;
    }
    
    // 获取配置
    const config = vscode.workspace.getConfiguration('cpcode');
    const apiEndpoint = config.get<string>('apiEndpoint', '');
    
    // 从 API 或本地 git remote 获取原始 URL
    const originalUrl = await getOriginalUrl(apiEndpoint, projectName, forceRefresh, gitRoot);
    if (!originalUrl) {
        const errorMsg = apiEndpoint 
            ? `无法从 API 获取 '${projectName}' 的 URL`
            : `无法获取 '${projectName}' 的 git remote URL`;
        vscode.window.showErrorMessage(errorMsg);
        return;
    }
    
    // 构建链接
    let finalLink = `${originalUrl}/blob/${commitHash}/${relativePath}`;
    finalLink += `#L${startLine}`;
    if (startLine !== endLine) {
        finalLink += `-L${endLine}`;
    }
    
    // 生成输出
    const linkText = `[${filename}](${finalLink})`;
    const language = getLanguageIdentifier(filename);
    
    // 构建完整输出 (使用 = 后跟起始行号来标记代码块)
    let finalOutput = linkText;
    finalOutput += '\n\n';
    finalOutput += '```' + language + '=' + startLine + '\n';
    finalOutput += selectedText;
    if (!selectedText.endsWith('\n')) {
        finalOutput += '\n';
    }
    finalOutput += '```';

    // 自动复制到剪贴板
    await vscode.env.clipboard.writeText(finalOutput);
    vscode.window.showInformationMessage(`✅ 已复制到剪贴板: ${filename} L${startLine}-L${endLine}`);
}

export function activate(context: vscode.ExtensionContext) {
    console.log('CPCode 插件已激活');
    
    // 注册复制代码链接命令
    // 注意：必须用箭头函数包装，否则 VS Code 传递的参数（如 URI）会被当作 forceRefresh 参数
    const copyCommand = vscode.commands.registerCommand('cpcode.copyCodeLink', () => copyCodeLink(false));
    context.subscriptions.push(copyCommand);
    
    // 注册清除缓存命令
    const clearCacheCommand = vscode.commands.registerCommand('cpcode.clearCache', () => {
        clearCache();
        vscode.window.showInformationMessage('CPCode: 缓存已清除');
    });
    context.subscriptions.push(clearCacheCommand);
    
    // 注册强制刷新并复制链接命令
    const forceRefreshCommand = vscode.commands.registerCommand('cpcode.copyCodeLinkForceRefresh', () => copyCodeLink(true));
    context.subscriptions.push(forceRefreshCommand);
}

export function deactivate() {
    console.log('CPCode 插件已停用');
}

