/**
 * 把 openGym 的动作示范视频同步到 data/gym/media/clip
 *
 * 动作示范用的是 openGym 仓库里的解剖插画循环动画（catalogue/media/clip/<id>.mp4），
 * 每个 15–60KB，一共 6500 多个、约 160MB，所以不放进仓库（.gitignore 已排除 data/gym/media）。
 * 换机器 / 重新 clone 之后跑一次这个脚本即可。
 *
 * 用法：
 *   git clone --depth 1 https://github.com/DuarteSantos8/openGym.git .tmp-gym
 *   node tools/sync-gym-media.mjs
 *   node tools/sync-gym-media.mjs --force   # 覆盖已有文件
 */
import { mkdir, readdir, copyFile, stat } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, '.tmp-gym', 'catalogue', 'media', 'clip');
const DST = path.join(ROOT, 'data', 'gym', 'media', 'clip');
const force = process.argv.includes('--force');

async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!(await exists(SRC))) {
    console.error(`找不到 ${SRC}`);
    console.error('先把 openGym clone 到项目里的 .tmp-gym：');
    console.error('  git clone --depth 1 https://github.com/DuarteSantos8/openGym.git .tmp-gym');
    process.exit(1);
  }
  await mkdir(DST, { recursive: true });
  const files = (await readdir(SRC)).filter((f) => f.endsWith('.mp4'));
  let copied = 0;
  let skipped = 0;
  for (const name of files) {
    const dst = path.join(DST, name);
    if (!force && (await exists(dst))) {
      skipped += 1;
      continue;
    }
    await copyFile(path.join(SRC, name), dst);
    copied += 1;
    if (copied % 500 === 0) console.log(`  已复制 ${copied} / ${files.length}`);
  }
  console.log(`完成：复制 ${copied} 个，跳过 ${skipped} 个，共 ${files.length} 个动作视频`);
  console.log(`目录：${DST}`);
}

await main();
