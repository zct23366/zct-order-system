import { useEffect, useState } from 'react';
import { isIosLike, isStandaloneDisplay, onDisplayModeChange } from '@/lib/standalone';

/**
 * 订阅「是否以独立窗口运行」，以及设备是不是 iOS / iPadOS。
 *
 * 首帧直接取同步判定结果（index.html 的内联脚本已经写过同样的标记），
 * 不放在 effect 里初始化，避免安装提示先闪一下再消失。
 *
 * @returns standalone = 独立窗口（无边框）运行；ios = iOS / iPadOS 设备
 */
export function useStandalone(): { standalone: boolean; ios: boolean } {
  const [standalone, setStandalone] = useState(isStandaloneDisplay);
  const [ios] = useState(isIosLike);

  useEffect(() => onDisplayModeChange(() => setStandalone(isStandaloneDisplay())), []);

  return { standalone, ios };
}
