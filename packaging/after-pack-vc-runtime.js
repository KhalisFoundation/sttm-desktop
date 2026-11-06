/* eslint-disable no-console */
// electron-builder afterPack hook (Windows only): put the Microsoft Visual C++ runtime DLLs next to
// Voice Autopilot's speech engine (onnxruntime-node) inside the packed app.
//
// onnxruntime.dll and onnxruntime_binding.node import MSVCP140.dll, MSVCP140_1.dll,
// MSVCP140_ATOMIC_WAIT.dll, VCRUNTIME140.dll and VCRUNTIME140_1.dll. Electron itself does not ship
// them, and a Windows PC without a recent "Visual C++ 2015-2022 Redistributable" (fresh installs,
// older laptops) cannot load the engine. Node loads native addons with LOAD_WITH_ALTERED_SEARCH_PATH,
// so DLLs in the addon's own folder are found first. Microsoft allows this app-local deployment of
// the redistributable files.
//
// Source of the DLLs, in order: VC_RUNTIME_DIR (a folder holding them), the newest
// VC\Redist\MSVC\*\<arch>\Microsoft.VC14*.CRT folder of an installed Visual Studio (vswhere),
// then the build PC's own System32 (x64) / SysWOW64 (ia32).
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REQUIRED = ['msvcp140.dll', 'msvcp140_1.dll', 'msvcp140_atomic_wait.dll', 'vcruntime140.dll'];
const OPTIONAL = ['msvcp140_2.dll', 'msvcp140_codecvt_ids.dll', 'concrt140.dll'];

function archName(arch) {
  // electron-builder Arch enum: 0 ia32, 1 x64, 2 armv7l, 3 arm64, 4 universal
  return { 0: 'ia32', 1: 'x64', 3: 'arm64' }[arch] || String(arch);
}

function vsRedistDir(arch) {
  const vswhere = path.join(
    process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
    'Microsoft Visual Studio',
    'Installer',
    'vswhere.exe',
  );
  if (!fs.existsSync(vswhere)) return null;
  try {
    const out = execFileSync(
      vswhere,
      ['-latest', '-products', '*', '-find', `VC\\Redist\\MSVC\\*\\${arch === 'ia32' ? 'x86' : arch}\\Microsoft.VC14*.CRT`],
      { encoding: 'utf8' },
    );
    const dirs = out.split(/\r?\n/).filter(Boolean).sort();
    return dirs.length ? dirs[dirs.length - 1] : null;
  } catch (_) {
    return null;
  }
}

function sourceDir(arch) {
  const candidates = [
    process.env.VC_RUNTIME_DIR,
    vsRedistDir(arch),
    path.join(process.env.SystemRoot || 'C:\\Windows', arch === 'ia32' ? 'SysWOW64' : 'System32'),
  ].filter(Boolean);
  return candidates.find((d) => REQUIRED.every((f) => fs.existsSync(path.join(d, f))));
}

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;
  const arch = archName(context.arch);
  const engineDir = path.join(
    context.appOutDir,
    'resources',
    'app.asar.unpacked',
    'node_modules',
    'onnxruntime-node',
    'bin',
    'napi-v6',
    'win32',
    arch,
  );
  if (!fs.existsSync(engineDir)) {
    console.log(`  • vc-runtime: no speech engine for win32/${arch} (${engineDir}); nothing to add`);
    return;
  }
  const src = sourceDir(arch);
  if (!src) {
    throw new Error(
      `vc-runtime: could not find ${REQUIRED.join(', ')} for ${arch}. Install the Visual C++ ` +
        '2015-2022 Redistributable (or Visual Studio) on the build PC, or set VC_RUNTIME_DIR.',
    );
  }
  const vc14 = arch === 'x64' || arch === 'arm64' ? ['vcruntime140_1.dll'] : [];
  const copied = [];
  [...REQUIRED, ...vc14, ...OPTIONAL].forEach((f) => {
    const from = path.join(src, f);
    if (!fs.existsSync(from)) {
      if (REQUIRED.includes(f) || vc14.includes(f)) throw new Error(`vc-runtime: missing ${from}`);
      return;
    }
    fs.copyFileSync(from, path.join(engineDir, f));
    copied.push(f);
  });
  console.log(`  • vc-runtime: ${copied.length} DLLs from ${src} -> ${engineDir}`);
};
