# CPCode - Code Path Linker

一个 VS Code 插件，用于生成选中代码的 GitHub 链接和 Markdown 格式代码片段。

## 功能概览

| 命令 | 快捷键 | 说明 |
|------|--------|------|
| CPCode: 复制代码链接 | `Ctrl+Shift+C` (Mac: `Cmd+Shift+C`) | 生成代码链接并显示弹窗 |
| CPCode: 复制代码链接 (强制刷新) | - | 忽略缓存，重新获取 URL 后生成链接 |
| CPCode: 清除缓存 | `Ctrl+Shift+Alt+C` (Mac: `Cmd+Shift+Alt+C`) | 清除所有 URL 缓存 |

---

## 命令

### 1. CPCode: 复制代码链接

**触发方式：**
- 快捷键：`Ctrl+Shift+C` (Mac: `Cmd+Shift+C`)
- 右键菜单：选中代码后右键 → "CPCode: 复制代码链接"
- 命令面板：`Ctrl+Shift+P` → 输入 "CPCode: 复制代码链接"

**预期行为：**
1. 获取当前选中的代码内容
2. 获取 Git 仓库信息（项目名、commit hash、相对路径）
3. 根据配置获取仓库的远程 URL（从 API 或本地 git remote）
4. 生成 GitHub 链接（包含 commit hash 和行号范围）
5. 显示弹窗提示 `✅ 代码链接已生成: filename L开始行-L结束行`
6. 点击弹窗中的「复制到剪贴板」按钮后，将完整 Markdown 输出复制到剪贴板

**输出格式：**


> [filename.ts](https://github.com/user/repo/blob/commit-hash/path/to/file.ts#L10-L20)
> 
>  ```typescript=10
> // 选中的代码片段
>  ```

**失败场景：**

| 错误信息 | 原因 | 解决方法 |
|----------|------|----------|
| `没有打开的编辑器` | 当前没有打开任何文件 | 打开一个文件后再执行命令 |
| `请先选择一段代码` | 没有选中任何代码 | 先用鼠标或键盘选中代码 |
| `当前目录不是一个 Git 仓库` | 文件所在目录不在 Git 仓库内 | 确保文件在一个已初始化的 Git 仓库中 |
| `无法获取 Git commit hash` | Git 仓库没有任何提交记录 | 先执行 `git commit` 创建至少一个提交 |
| `无法从 API 获取 '项目名' 的 URL` | 配置了 `apiEndpoint`，但 API 请求失败或返回无效数据 | 检查 API 端点是否正确、网络是否通畅 |
| `无法获取 '项目名' 的 git remote URL` | 未配置 `apiEndpoint`，且本地没有设置 git remote origin | 执行 `git remote add origin <url>` 设置远程仓库 |

---

### 2. CPCode: 复制代码链接 (强制刷新)

**触发方式：**
- 命令面板：`Ctrl+Shift+P` → 输入 "CPCode: 复制代码链接 (强制刷新)"

**预期行为：**
- 与「复制代码链接」功能相同，但会忽略本地缓存
- 强制重新从 API 或 git remote 获取仓库 URL
- 获取成功后会更新缓存

**使用场景：**
- 项目的远程 URL 发生变化后
- 怀疑缓存数据不正确时
- API 返回数据已更新，需要获取最新值

**失败场景：**
- 与「复制代码链接」相同

---

### 3. CPCode: 清除缓存

**触发方式：**
- 快捷键：`Ctrl+Shift+Alt+C` (Mac: `Cmd+Shift+Alt+C`)
- 命令面板：`Ctrl+Shift+P` → 输入 "CPCode: 清除缓存"

**预期行为：**
1. 清除所有已缓存的项目 URL
2. 显示提示信息 `CPCode: 缓存已清除`

**使用场景：**
- 需要清除所有项目的缓存（而不仅仅是当前项目）
- 插件行为异常，需要重置状态

**失败场景：**
- 此命令不会失败

---

## 配置项

在 VS Code 设置中搜索 `cpcode` 可以找到以下配置：

### cpcode.apiEndpoint

| 属性 | 值 |
|------|-----|
| 类型 | `string` |
| 默认值 | `""` (空字符串) |

**功能说明：**

API 端点地址，用于通过项目名称获取对应的 GitHub 仓库 URL。

**工作原理：**
- 当此配置为空时，插件会直接读取本地 git remote origin 的 URL
- 当此配置不为空时，插件会请求 `{apiEndpoint}/{projectName}` 接口
- API 应返回 JSON 格式：`{ "original_url": "https://github.com/user/repo" }`

**示例：**
```
https://api.example.com/repos
```
设置后，插件会请求 `https://api.example.com/repos/your-project-name`

**使用场景：**
- 项目是从其他来源 clone 的镜像仓库，需要链接到原始仓库
- 内部有统一的项目管理 API
- 需要动态映射项目名到仓库 URL

---

### cpcode.cacheTimeout

| 属性 | 值 |
|------|-----|
| 类型 | `number` |
| 默认值 | `600` |
| 最小值 | `0` |
| 单位 | 秒 |

**功能说明：**

URL 缓存的超时时间。插件会将获取到的仓库 URL 缓存起来，避免每次都请求 API 或执行 git 命令。

**工作原理：**
- 第一次获取某个项目的 URL 后，会将结果存入内存缓存
- 在缓存有效期内，后续请求会直接使用缓存的 URL
- 缓存过期后，下次请求会重新获取 URL
- 设置为 `0` 则禁用缓存，每次都重新获取

**推荐设置：**
- 一般情况：保持默认值 `600`（10 分钟）
- 频繁切换项目：可以增大到 `3600`（1 小时）
- 调试/测试：设置为 `0` 禁用缓存

---

## 安装

### 从源码安装

```bash
# 安装依赖
npm install

# 编译
npm run compile

# 打包
npx vsce package

# 安装生成的 .vsix 文件
code --install-extension cpcode-0.0.1.vsix
```

---

## 前置条件

- 项目必须是一个 Git 仓库（已执行 `git init`）
- 项目必须有至少一个 commit
- 以下条件满足其一：
  - 已设置 git remote origin（`git remote add origin <url>`）
  - 或已配置 `cpcode.apiEndpoint` 且 API 能正确返回仓库 URL

---

## 支持的语言

插件会根据文件扩展名自动识别语言，用于生成代码块的语法高亮标识：

| 扩展名 | 语言标识 |
|--------|----------|
| `.sol` | solidity |
| `.py` | python |
| `.js`, `.jsx` | javascript |
| `.ts`, `.tsx` | typescript |
| `.go` | go |
| `.rs` | rust |
| `.md` | markdown |
| `.json` | json |
| `.yaml`, `.yml` | yaml |
| `.sh`, `.bash`, `.zsh` | bash |
| `.css` | css |
| `.scss` | scss |
| `.html` | html |
| `.vue` | vue |
| `.java` | java |
| `.c`, `.h` | c |
| `.cpp`, `.hpp` | cpp |

其他扩展名会直接使用扩展名作为语言标识。

---

## License

MIT
