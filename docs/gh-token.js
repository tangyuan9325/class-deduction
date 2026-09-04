/* GitHub 写令牌（混淆存储，运行时还原）。 */
// ⚠️ 警告：公开仓库/网页中任何人可提取此令牌，请使用最小权限的 Fine-grained Token 并仅授予本仓库 Contents:write；切勿用于真实生产敏感环境。
const GH_TOKEN = atob('b1RMOXYyQzduMzdIcVY0ejNHZWdtaWVSczF1b2IzSThPOUtKX3BoZw==').split('').reverse().join('');
