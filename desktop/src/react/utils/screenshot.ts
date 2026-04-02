// desktop/src/react/utils/screenshot.ts
import html2canvas from 'html2canvas';
import { useStore } from '../stores';
import { selectSelectedIdsBySession } from '../stores/session-selectors';

// 临时隐藏按钮和选中高亮的 CSS class（注入一次，全局复用）
const HIDE_CLASS = 'hana-screenshotting';
let styleInjected = false;
function injectHideStyle() {
  if (styleInjected) return;
  const style = document.createElement('style');
  style.textContent = `.${HIDE_CLASS} [class*="msgActions"] { display:none !important; }
.${HIDE_CLASS} [class*="messageGroupSelected"] { background:transparent !important; }`;
  document.head.appendChild(style);
  styleInjected = true;
}

/**
 * 截图指定消息并保存到文件。
 * 直接对原始 DOM 截图（不克隆），保证截出来和看到的一模一样。
 * 多选时分别截每条消息，再用 Canvas API 拼接。
 */
export async function takeScreenshot(targetMessageId: string, sessionPath: string): Promise<void> {
  const state = useStore.getState();
  const ids = selectSelectedIdsBySession(state, sessionPath);
  const messageIds = ids.length > 0 ? ids : [targetMessageId];

  // 1. 收集 DOM 节点（按文档顺序）
  const nodes: HTMLElement[] = [];
  for (const id of messageIds) {
    const el = document.querySelector(`[data-message-id="${id}"]`) as HTMLElement | null;
    if (el) nodes.push(el);
  }
  nodes.sort((a, b) => {
    const pos = a.compareDocumentPosition(b);
    return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  });

  if (nodes.length === 0) return;

  // 2. 判断是否需要隐藏头像（单方消息不显示头像）
  const roles = new Set<string>();
  const session = state.chatSessions[sessionPath];
  if (session) {
    for (const item of session.items) {
      if (item.type !== 'message') continue;
      if (messageIds.includes(item.data.id)) roles.add(item.data.role);
    }
  }
  const isMixed = roles.size > 1;

  // 3. 临时隐藏按钮 + 选中高亮
  injectHideStyle();
  document.body.classList.add(HIDE_CLASS);

  // 临时隐藏单方消息的头像行
  const hiddenAvatars: HTMLElement[] = [];
  if (!isMixed) {
    for (const node of nodes) {
      const avatarRow = node.querySelector('[class*="avatarRow"]') as HTMLElement | null;
      if (avatarRow && avatarRow.style.display !== 'none') {
        avatarRow.style.display = 'none';
        hiddenAvatars.push(avatarRow);
      }
    }
  }

  try {
    // 4. 逐条截图
    const scale = 2; // Retina
    const canvases: HTMLCanvasElement[] = [];
    for (const node of nodes) {
      const c = await html2canvas(node, {
        backgroundColor: null,
        useCORS: true,
        allowTaint: true,
        scale,
      });
      canvases.push(c);
    }

    // 5. 拼接所有 canvas
    const totalH = canvases.reduce((sum, c) => sum + c.height, 0);
    const maxW = Math.max(...canvases.map(c => c.width));
    const WATERMARK_H = 40 * scale;
    const PADDING = 24 * scale;

    const final = document.createElement('canvas');
    final.width = maxW + PADDING * 2;
    final.height = totalH + WATERMARK_H + PADDING * 2;
    const ctx = final.getContext('2d')!;

    // 背景色
    const bgColor = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#faf8f5';
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, final.width, final.height);

    // 绘制每条消息
    let y = PADDING;
    for (const c of canvases) {
      ctx.drawImage(c, PADDING, y);
      y += c.height;
    }

    // 6. 水印：圆形 logo + 宋体文字
    ctx.globalAlpha = 0.15;
    const serifFont = getComputedStyle(document.documentElement).getPropertyValue('--font-serif').trim() || "'Songti SC', Georgia, serif";
    const wmY = y + WATERMARK_H / 2;
    const logoSize = 20 * scale;

    // 画圆形 logo
    const logoImg = new Image();
    logoImg.crossOrigin = 'anonymous';
    const baseUrl = document.baseURI.replace(/\/[^/]*$/, '/');
    await new Promise<void>((resolve) => {
      logoImg.onload = () => resolve();
      logoImg.onerror = () => resolve(); // logo 加载失败也不阻塞
      logoImg.src = `${baseUrl}assets/Hanako.png`;
    });
    if (logoImg.naturalWidth > 0) {
      const logoX = final.width - PADDING - logoSize - 8 * scale - ctx.measureText('OpenHanako').width;
      // 这里先量文字宽度需要先设字体
      ctx.font = `${12 * scale}px ${serifFont}`;
      const textW = ctx.measureText('OpenHanako').width;
      const lx = final.width - PADDING - textW - 8 * scale - logoSize;
      ctx.save();
      ctx.beginPath();
      ctx.arc(lx + logoSize / 2, wmY, logoSize / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(logoImg, lx, wmY - logoSize / 2, logoSize, logoSize);
      ctx.restore();
    }

    // 画文字
    ctx.font = `${12 * scale}px ${serifFont}`;
    ctx.fillStyle = '#999';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText('OpenHanako', final.width - PADDING, wmY);
    ctx.globalAlpha = 1;

    // 7. 导出 & 保存
    const blob = await new Promise<Blob | null>((resolve) => final.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('canvas.toBlob returned null');

    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });

    const homeFolder = state.homeFolder;
    const t = window.t ?? ((p: string) => p);
    let dir: string;
    if (homeFolder) {
      dir = `${homeFolder}/截图`;
    } else {
      dir = '~/Desktop/截图';
    }

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const filePath = `${dir}/hanako-${timestamp}.png`;

    const hana = (window as any).hana;
    if (!hana?.writeFileBinary) {
      state.addToast(t('common.screenshotFailed'), 'error');
      return;
    }

    const ok = await hana.writeFileBinary(filePath, base64);
    if (ok) {
      state.addToast(t('common.screenshotSaved').replace('{path}', filePath), 'success', 4000);
    } else {
      state.addToast(`${t('common.screenshotFailed')}: write failed → ${filePath}`, 'error', 8000);
    }
  } catch (err: any) {
    console.error('[screenshot]', err);
    const t = window.t ?? ((p: string) => p);
    const detail = err?.message || String(err);
    state.addToast(`${t('common.screenshotFailed')}: ${detail}`, 'error', 8000);
  } finally {
    // 恢复：移除隐藏 class，恢复头像
    document.body.classList.remove(HIDE_CLASS);
    for (const el of hiddenAvatars) el.style.display = '';
  }
}
