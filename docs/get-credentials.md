# 获取 Cloudflare Account ID 与 API Token（3 步，1 分钟）

面板只需要两样东西：**Account ID**（账号编号）和 **API Token**（带隧道权限的令牌）。照着下面点一遍就行，不需要看懂 Cloudflare 的其他功能。

> 前提：你已经有一个托管在 Cloudflare 上的域名（域名在 Cloudflare 后台显示为「活动」状态）。

---

## 第 1 步：复制 Account ID

1. 登录 <https://dash.cloudflare.com>
2. 随便进入任意一个域名的管理页（或直接在**首页**）
3. **右侧栏**找到「**账户 ID / Account ID**」，点旁边的复制按钮

它是一串 32 位字符，形如 `a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6` —— 这就是 Account ID。

> 找不到？也可以打开 <https://dash.cloudflare.com/?to=/:account/workers> ，右侧栏同样能看到「账户 ID」。

## 第 2 步：创建一个只带 Tunnel + DNS 权限的令牌

1. 打开 <https://dash.cloudflare.com/profile/api-tokens>
2. 点「**创建令牌 / Create Token**」
3. 拉到页面最下面，选「**创建自定义令牌 / Create Custom Token**」的「开始使用」
4. 按下面填，**只加这两条权限**（其他都留空）：

   | 权限类型 | 权限 | 级别 |
   |---|---|---|
   | 账户 / Account | **Cloudflare Tunnel** | **编辑 / Edit** |
   | 区域 / Zone | **DNS** | **编辑 / Edit** |

5. 往下「账户资源」选你的账户，「区域资源」选你要用的那个域名（也可以先选「所有区域」）
6. 点「继续以显示摘要」→「**创建令牌**」
7. **立刻复制这串令牌**（形如 `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`，只显示这一次，关掉就再也看不到了）

> ⚠️ 权限别多给：只给这两条就够了。不要用「Global API Key」（账户全局密钥，权限过大）。
> 💡 找不到「DNS」？注意是 **DNS**（区域级），不是「DNS 设置 / DNS Settings」。

## 第 3 步：填进面板

1. 打开面板 → 左侧「**⚙️ 系统配置**」
2. 「Cloudflare 账号」两个框分别粘贴 **Account ID** 和 **API Token**
3. 点「**测试配置**」→ 显示「✅ 测试通过：凭据有效」
4. 点「**保存配置**」完成

之后就可以去「Tunnel 列表」新建隧道了。

---

## 常见问题

**提示 Invalid API Token / 认证失败**
- 令牌复制不完整（前后带了空格）→ 重新复制一次
- 权限没给对：必须是「账户 · Cloudflare Tunnel · 编辑」+「区域 · DNS · 编辑」
- 区域资源没包含你要用的域名

**提示找不到账户 / 无法创建隧道**
- Account ID 填错了（复制时多带了字符）
- 令牌的「账户资源」没选对账户

**令牌泄露了怎么办**
- 回到 <https://dash.cloudflare.com/profile/api-tokens> ，把该令牌「删除」或「回滚」，重新生成一个填进面板即可。

**凭据存在哪**
- 只保存在你自己服务器的 `data/` 目录里，项目不含任何上报逻辑，不会外传。

---

## 一键跳转

| 用途 | 地址 |
|---|---|
| API 令牌管理（创建/删除令牌） | <https://dash.cloudflare.com/profile/api-tokens> |
| 域名列表（查看账户 ID 也可在这里右侧栏） | <https://dash.cloudflare.com> |
