import { sendToCard as sendCurrent, withCardLock } from './ble.js?v=20261124e';
import { sendToCard as sendLegacy } from './ble-legacy.js?v=20261124e';
import { sendToCard as sendDiscovery } from './ble-20261124b.js?v=20261124e';

export const TRANSFER_PROFILES = Object.freeze([
  { id: 'legacy', label: 'A · 11月22日旧版（优先测试）', revision: '7b79971',
    description: '枚举服务 + writeValue 控制写入；保留旧版数据流控。' },
  { id: 'discovery', label: 'B · 11月24日 b 版', revision: 'f175352',
    description: '指定服务查找 + writeValue 控制写入，用于对比服务发现的影响。' },
  { id: 'current', label: 'C · 11月24日 d 版', revision: '7aeca4a',
    description: '指定服务查找 + 按特征能力显式写入，用于对比写入 API 的影响。' },
]);

export async function sendWithProfile(payload, log, onProgress, device, profileId = 'legacy') {
  const profile = TRANSFER_PROFILES.find(p => p.id === profileId);
  if (!profile) throw new Error('未知传输版本，请重新选择');
  log(`传输对比：${profile.label} [${profile.revision}]；payload ${payload.length} B`);
  // Never automatically replay an image with another profile after a failure.
  // Each button press performs exactly one selected implementation.
  const result = profile.id === 'legacy'
    ? await withCardLock(() => sendLegacy(payload, log, onProgress, device))
    : await (profile.id === 'discovery' ? sendDiscovery : sendCurrent)(payload, log, onProgress, device);
  log(`对比结果 [${profile.revision}]：${result.acked ? '收到卡片显影确认' : '已写完，但未收到显影确认'}`);
  return { ...result, profile: profile.id, revision: profile.revision };
}
