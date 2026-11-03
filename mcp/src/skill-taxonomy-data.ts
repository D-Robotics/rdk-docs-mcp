// Reviewed catalog overlay. Exact content fingerprint prevents stale classifications.
// Classification is search scope, not proof of hardware compatibility.
// Refreshed 2026-11-03 against rdk-skills f205371baee8731988c8857ead7ffe23b67c501c.
// Most renamed records retain their previously reviewed classifications:
// __SKILL_j6-plugin-__* -> s-plugin-*, j6-hbdk-* -> s-hbdk-*, j6-ucp-* -> s-ucp-*,
// j6-board-monitor -> s-board-monitor, horizon-router -> drobotics-router.
// hmct-workflow also handles standard PTQ compilation; s-hbdk-compile handles
// QAT qat.bc and, for explicitly requested custom workflows, calibrated PTQ ONNX.
// Skills that were never reviewed stay unclassified.
// s-hbdk-compile / s-hbdk-export-compile remain the reviewed S-series compile steps.
// rdk-network-remote names no exact board set, so platform scope remains unknown.
// x5-board-monitor and s-board-monitor stay the reviewed board monitors.
export const TAXONOMY_DATA = [
  {
    "name": "s-plugin-adaptation",
    "fingerprint": "113abcfb1f06b1b51188cd05ac229fe54ca2f8e2096aa0a7dc9471d56ff7c29d",
    "tasks": [
      "model_conversion"
    ],
    "workflows": [
      "qat"
    ],
    "platforms": [
      "s100",
      "s100p",
      "s600"
    ],
    "role": "workflow",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/f205371baee8731988c8857ead7ffe23b67c501c/skills/oe-skills-s/skills/plugin/s-plugin-adaptation/SKILL.md"
  },
  {
    "name": "s-plugin-consistency-debug",
    "fingerprint": "296b3cdd32df5ff767ff802f75e2072721e882c697a9f11fee61c8745caa09c5",
    "tasks": [
      "model_conversion"
    ],
    "workflows": [
      "qat"
    ],
    "platforms": [
      "s100",
      "s100p",
      "s600"
    ],
    "role": "step",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/f205371baee8731988c8857ead7ffe23b67c501c/skills/oe-skills-s/skills/plugin/s-plugin-consistency-debug/SKILL.md"
  },
  {
    "name": "s-plugin-dynamic-block",
    "fingerprint": "70c310b6094af50fbe143d394849ff1bf966af1b6d03cd3b3343e7aa01c94341",
    "tasks": [
      "model_conversion"
    ],
    "workflows": [
      "qat"
    ],
    "platforms": [
      "s100",
      "s100p",
      "s600"
    ],
    "role": "step",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/f205371baee8731988c8857ead7ffe23b67c501c/skills/oe-skills-s/skills/plugin/s-plugin-adaptation/s-plugin-dynamic-block/SKILL.md"
  },
  {
    "name": "s-plugin-export",
    "fingerprint": "bca20ed3a44de45852e228ba48c6a0ceb37f07a153f236458bccfec7ef4e8f36",
    "tasks": [
      "model_conversion"
    ],
    "workflows": [
      "qat"
    ],
    "platforms": [
      "s100",
      "s100p",
      "s600"
    ],
    "role": "step",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/f205371baee8731988c8857ead7ffe23b67c501c/skills/oe-skills-s/skills/plugin/s-plugin-export/SKILL.md"
  },
  {
    "name": "s-plugin-graph-diff",
    "fingerprint": "1fe9b28723f3cbaef138c487696295d95d3876dbb34780b286138a65493bb1be",
    "tasks": [
      "model_conversion"
    ],
    "workflows": [
      "qat"
    ],
    "platforms": [
      "s100",
      "s100p",
      "s600"
    ],
    "role": "step",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/f205371baee8731988c8857ead7ffe23b67c501c/skills/oe-skills-s/skills/plugin/s-plugin-graph-diff/SKILL.md"
  },
  {
    "name": "s-plugin-hbdk-generating",
    "fingerprint": "999930a54e7eb6c2383b4fb25e41e8bd27c3e32d592cd3e38bec0d788842c018",
    "tasks": [
      "model_conversion"
    ],
    "workflows": [
      "qat"
    ],
    "platforms": [
      "s100",
      "s100p",
      "s600"
    ],
    "role": "workflow",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/f205371baee8731988c8857ead7ffe23b67c501c/skills/oe-skills-s/skills/plugin/s-plugin-hbdk-generating/SKILL.md"
  },
  {
    "name": "s-plugin-insert-quant-dequant",
    "fingerprint": "05147b39ec1a8dae3b3ad114cfc92f4b0a0b0ee67639bb8b13d6bfd5834c7e66",
    "tasks": [
      "model_conversion"
    ],
    "workflows": [
      "qat"
    ],
    "platforms": [
      "s100",
      "s100p",
      "s600"
    ],
    "role": "step",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/f205371baee8731988c8857ead7ffe23b67c501c/skills/oe-skills-s/skills/plugin/s-plugin-adaptation/s-plugin-insert-quant-dequant/SKILL.md"
  },
  {
    "name": "s-plugin-model-check-result",
    "fingerprint": "b23c765b3c5fb70a1072968f8527b955c7ae8257953a2a9c7f97eec9238701da",
    "tasks": [
      "model_conversion"
    ],
    "workflows": [
      "qat"
    ],
    "platforms": [
      "s100",
      "s100p",
      "s600"
    ],
    "role": "step",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/f205371baee8731988c8857ead7ffe23b67c501c/skills/oe-skills-s/skills/plugin/s-plugin-model-check-result/SKILL.md"
  },
  {
    "name": "s-plugin-precision-tuning",
    "fingerprint": "63fa0b579344cd8e9c33c9301c0454ef4e689a5df0aa1d2d861cce46a4a85681",
    "tasks": [
      "model_conversion"
    ],
    "workflows": [
      "qat"
    ],
    "platforms": [
      "s100",
      "s100p",
      "s600"
    ],
    "role": "step",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/f205371baee8731988c8857ead7ffe23b67c501c/skills/oe-skills-s/skills/plugin/s-plugin-precision-tuning/SKILL.md"
  },
  {
    "name": "s-plugin-prepare",
    "fingerprint": "1da8a5c1b5d64379fafc0894cb902e99f06aa132e1f52e156c67c2de583b26d7",
    "tasks": [
      "model_conversion"
    ],
    "workflows": [
      "qat"
    ],
    "platforms": [
      "s100",
      "s100p",
      "s600"
    ],
    "role": "step",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/f205371baee8731988c8857ead7ffe23b67c501c/skills/oe-skills-s/skills/plugin/s-plugin-adaptation/s-plugin-prepare/SKILL.md"
  },
  {
    "name": "s-plugin-quantization",
    "fingerprint": "b19a985ca9f66d0ef30406b2cea7a026bb5e4dfc05ed9fb1e0b55a1614679565",
    "tasks": [
      "model_conversion"
    ],
    "workflows": [
      "qat"
    ],
    "platforms": [
      "s100",
      "s100p",
      "s600"
    ],
    "role": "workflow",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/f205371baee8731988c8857ead7ffe23b67c501c/skills/oe-skills-s/skills/plugin/s-plugin-hbdk-generating/s-plugin-quantization/SKILL.md"
  },
  {
    "name": "s-plugin-set-fake-quantize",
    "fingerprint": "ba2ea7b141ec8b6bba6dcc7e2582366f91062aca8d6843c88310c7a11e4b9945",
    "tasks": [
      "model_conversion"
    ],
    "workflows": [
      "qat"
    ],
    "platforms": [
      "s100",
      "s100p",
      "s600"
    ],
    "role": "step",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/f205371baee8731988c8857ead7ffe23b67c501c/skills/oe-skills-s/skills/plugin/s-plugin-adaptation/s-plugin-set-fake-quantize/SKILL.md"
  },
  {
    "name": "s-plugin-set-march",
    "fingerprint": "56a566784e68792ebfcecfd3acd0d9eed0537bfc8f826dd51a27e22b75a32920",
    "tasks": [
      "model_conversion"
    ],
    "workflows": [
      "qat"
    ],
    "platforms": [
      "s100",
      "s100p",
      "s600"
    ],
    "role": "step",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/f205371baee8731988c8857ead7ffe23b67c501c/skills/oe-skills-s/skills/plugin/s-plugin-adaptation/s-plugin-set-march/SKILL.md"
  },
  {
    "name": "bsp-bootloader-build",
    "fingerprint": "d3dc8ad2131b2b1c588ae0a1c5ddda9235d515f36a18b57b87fa7faf784be1a1",
    "tasks": [
      "bsp"
    ],
    "workflows": [],
    "platforms": [
      "x5"
    ],
    "role": "workflow",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/f205371baee8731988c8857ead7ffe23b67c501c/skills/bsp-bootloader-build/SKILL.md"
  },
  {
    "name": "bsp-deb-build",
    "fingerprint": "694e14c364fc9fafb196add19c7e989ca27e0fcb00bc13d146a0a57fd87aa4b2",
    "tasks": [
      "bsp"
    ],
    "workflows": [],
    "platforms": null,
    "role": "workflow",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/f205371baee8731988c8857ead7ffe23b67c501c/skills/bsp-deb-build/SKILL.md"
  },
  {
    "name": "bsp-env-setup",
    "fingerprint": "2b05df772a9febd9a3a85dc74256285a682ebd83a06b46c1c127e0dbd6613364",
    "tasks": [
      "bsp"
    ],
    "workflows": [],
    "platforms": [
      "x3",
      "x5"
    ],
    "role": "workflow",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/f205371baee8731988c8857ead7ffe23b67c501c/skills/bsp-env-setup/SKILL.md"
  },
  {
    "name": "bsp-image-build",
    "fingerprint": "8995d97197b4b03bc29568dab248e4b63a95fcb3798d0e50c238f22afec7ea91",
    "tasks": [
      "bsp"
    ],
    "workflows": [],
    "platforms": [
      "x3",
      "x5"
    ],
    "role": "workflow",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/f205371baee8731988c8857ead7ffe23b67c501c/skills/bsp-image-build/SKILL.md"
  },
  {
    "name": "bsp-kernel-build",
    "fingerprint": "6c0e5f3d1cbdd716668aad411ab8ad1b5ffe4eb33dc3f2360fc7b5be39876991",
    "tasks": [
      "bsp"
    ],
    "workflows": [],
    "platforms": [
      "x3",
      "x5"
    ],
    "role": "workflow",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/f205371baee8731988c8857ead7ffe23b67c501c/skills/bsp-kernel-build/SKILL.md"
  },
  {
    "name": "bsp-rootfs-custom",
    "fingerprint": "6463f406e7700d06273ca08c9a044f88cff51754a40e26180c889de4a35b835a",
    "tasks": [
      "bsp"
    ],
    "workflows": [],
    "platforms": [
      "x3",
      "x5"
    ],
    "role": "workflow",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/f205371baee8731988c8857ead7ffe23b67c501c/skills/bsp-rootfs-custom/SKILL.md"
  },
  {
    "name": "bsp-s-series",
    "fingerprint": "5586ceb3da6dbd69e7e51b8c16033a4c024dea48391066cc1a82f7d3cedca9cf",
    "tasks": [
      "bsp"
    ],
    "workflows": [],
    "platforms": [
      "s100",
      "s100p",
      "s600"
    ],
    "role": "entry",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/f205371baee8731988c8857ead7ffe23b67c501c/skills/bsp-s-series/SKILL.md"
  },
  {
    "name": "bsp-source-sync",
    "fingerprint": "afae6e7f884f5ed114a373ae90d20dc7c8a6b8c740958700ec870445f83fbfb0",
    "tasks": [
      "bsp"
    ],
    "workflows": [],
    "platforms": [
      "x3",
      "x5"
    ],
    "role": "workflow",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/f205371baee8731988c8857ead7ffe23b67c501c/skills/bsp-source-sync/SKILL.md"
  },
  {
    "name": "hmct-workflow",
    "fingerprint": "6e60e79446c54e23ea0fb263036bf00b382b1d10d9ad78f1d70dfa33dbe5d4a0",
    "tasks": [
      "model_conversion",
      "model_compile"
    ],
    "workflows": [
      "ptq"
    ],
    "platforms": [
      "s100",
      "s100p",
      "s600"
    ],
    "role": "workflow",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/f205371baee8731988c8857ead7ffe23b67c501c/skills/oe-skills-s/skills/hmct/SKILL.md"
  },
  {
    "name": "drobotics-router",
    "fingerprint": "19288c95177f1ae0422fa8196e150f97b63eb815250f33d4de35f652905d5b3a",
    "tasks": [
      "model_conversion"
    ],
    "workflows": [],
    "platforms": [
      "s100",
      "s100p",
      "s600"
    ],
    "role": "entry",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/f205371baee8731988c8857ead7ffe23b67c501c/skills/oe-skills-s/skills/drobotics-router/SKILL.md"
  },
  {
    "name": "s-hbdk-compile",
    "fingerprint": "fcd2917381cc126348273798e7cf96958a3c06f8e4e41f52c7e17960092ca5ea",
    "tasks": [
      "model_conversion",
      "model_compile"
    ],
    "workflows": [
      "ptq",
      "qat"
    ],
    "platforms": [
      "s100",
      "s100p",
      "s600"
    ],
    "role": "step",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/f205371baee8731988c8857ead7ffe23b67c501c/skills/oe-skills-s/skills/hbdk/s-hbdk-compile/SKILL.md"
  },
  {
    "name": "s-hbdk-export-compile",
    "fingerprint": "5f3c8702f44e24d774ee0629daee9e2a91918db4da70b6cbb04866616345d0c3",
    "tasks": [
      "model_conversion",
      "model_compile"
    ],
    "workflows": [
      "qat"
    ],
    "platforms": [
      "s100",
      "s100p",
      "s600"
    ],
    "role": "step",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/f205371baee8731988c8857ead7ffe23b67c501c/skills/oe-skills-s/skills/plugin/s-plugin-hbdk-generating/s-hbdk-export-compile/SKILL.md"
  },
  {
    "name": "s-ucp-hbm-infer",
    "fingerprint": "7db707a495249781e3af305d9d39a3a7f68595584fa01a2a92f4159a3bdc449d",
    "tasks": [
      "model_deploy"
    ],
    "workflows": [],
    "platforms": [
      "s100",
      "s100p",
      "s600"
    ],
    "role": "workflow",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/f205371baee8731988c8857ead7ffe23b67c501c/skills/oe-skills-s/skills/ucp/s-ucp-hbm-infer/SKILL.md"
  },
  {
    "name": "s-ucp-infer-generating",
    "fingerprint": "e5ffa7bcca9337e2fd394fd363047ee004d9efd4a9e6d340a0ec1b86f9c7fdd1",
    "tasks": [
      "model_deploy"
    ],
    "workflows": [],
    "platforms": [
      "s100",
      "s100p",
      "s600"
    ],
    "role": "workflow",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/f205371baee8731988c8857ead7ffe23b67c501c/skills/oe-skills-s/skills/ucp/s-ucp-infer-generating/SKILL.md"
  },
  {
    "name": "oe-package-detection",
    "fingerprint": "6be9c6b4f16b0485b5ed9c005465278fb071f0cb20078f1ca4672b4622d62319",
    "tasks": [
      "environment"
    ],
    "workflows": [],
    "platforms": [
      "s100",
      "s100p",
      "s600"
    ],
    "role": "workflow",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/f205371baee8731988c8857ead7ffe23b67c501c/skills/oe-skills-s/skills/drobotics-router/oe-package-detection/SKILL.md"
  },
  {
    "name": "oe-package-install",
    "fingerprint": "99a0a70d16d46db2234db39d34b2c4acbf98e0c610eb5edb4c17401e2b00cc56",
    "tasks": [
      "environment"
    ],
    "workflows": [],
    "platforms": [
      "s100",
      "s100p",
      "s600"
    ],
    "role": "workflow",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/f205371baee8731988c8857ead7ffe23b67c501c/skills/oe-skills-s/skills/drobotics-router/oe-package-install/SKILL.md"
  },
  {
    "name": "rdk-accessories",
    "fingerprint": "cb786538a749c3cc01ef2c2a84ee22a1f93eaaa5b4e48a793c7b2695106521be",
    "tasks": [
      "camera"
    ],
    "workflows": [],
    "platforms": null,
    "role": "workflow",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/f205371baee8731988c8857ead7ffe23b67c501c/skills/rdk-accessories/SKILL.md"
  },
  {
    "name": "rdk-board-knowledge",
    "fingerprint": "e20b18214c362481e54945fe1ae7fc26f7cdc58994c44a003502d0b4d5026471",
    "tasks": [
      "diagnostics"
    ],
    "workflows": [],
    "platforms": null,
    "role": "workflow",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/f205371baee8731988c8857ead7ffe23b67c501c/skills/rdk-board-knowledge/SKILL.md"
  },
  {
    "name": "rdk-camera-setup",
    "fingerprint": "00413c20ce2d29a75684cc4738683f1649141af2602342732c7e6d7ec29b912a",
    "tasks": [
      "camera"
    ],
    "workflows": [],
    "platforms": null,
    "role": "entry",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/f205371baee8731988c8857ead7ffe23b67c501c/skills/rdk-camera-setup/SKILL.md"
  },
  {
    "name": "rdk-diagnostic",
    "fingerprint": "13d987fc054a08edd20262fc2e02599fb0ef5901f6a8d7aaa1cf29044cf38ce2",
    "tasks": [
      "diagnostics"
    ],
    "workflows": [],
    "platforms": null,
    "role": "workflow",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/f205371baee8731988c8857ead7ffe23b67c501c/skills/rdk-diagnostic/SKILL.md"
  },
  {
    "name": "rdk-gpio-40pin",
    "fingerprint": "ff835cfc8b9cca7f51d8fca5e8a84046b9d5232928ef28b2f111d398229d65f7",
    "tasks": [
      "gpio",
      "uart"
    ],
    "workflows": [],
    "platforms": null,
    "role": "entry",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/f205371baee8731988c8857ead7ffe23b67c501c/skills/rdk-gpio-40pin/SKILL.md"
  },
  {
    "name": "rdk-hardware",
    "fingerprint": "5fd81675e64a3b3ea8d87757b8981a3634d0b230915f4492065e53128adbddd5",
    "tasks": [
      "gpio"
    ],
    "workflows": [],
    "platforms": null,
    "role": "entry",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/f205371baee8731988c8857ead7ffe23b67c501c/skills/rdk-hardware/SKILL.md"
  },
  {
    "name": "rdk-log-forensics",
    "fingerprint": "c661829cb0c21f1ff848167f1ee8fad25af6caf91aa24bbb899a9cbc4496e53e",
    "tasks": [
      "diagnostics"
    ],
    "workflows": [],
    "platforms": null,
    "role": "workflow",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/f205371baee8731988c8857ead7ffe23b67c501c/skills/rdk-log-forensics/SKILL.md"
  },
  {
    "name": "rdk-model-deploy",
    "fingerprint": "a1d76b25b5cd6a1e3c604379342d66056bda158f06d1a78e8fb3eb06bed82614",
    "tasks": [
      "model_deploy"
    ],
    "workflows": [],
    "platforms": null,
    "role": "workflow",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/f205371baee8731988c8857ead7ffe23b67c501c/skills/rdk-model-deploy/SKILL.md"
  },
  {
    "name": "rdk-model-zoo",
    "fingerprint": "2ca0cce663894a74a619ef920d7b36470cf1c7f44a78dcb93c10dd1d9eb897be",
    "tasks": [
      "ready_model"
    ],
    "workflows": [],
    "platforms": null,
    "role": "entry",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/f205371baee8731988c8857ead7ffe23b67c501c/skills/rdk-model-zoo/SKILL.md"
  },
  {
    "name": "rdk-model-zoo-develop",
    "fingerprint": "8ea604439ab68b7478d4096ad57e7a320cf7daa991ebd7af878095983763ca89",
    "tasks": [
      "model_maintenance"
    ],
    "workflows": [],
    "platforms": null,
    "role": "workflow",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/f205371baee8731988c8857ead7ffe23b67c501c/skills/rdk-model-zoo-develop/SKILL.md"
  },
  {
    "name": "rdk-model-zoo-integrate",
    "fingerprint": "99dc16d35cdd18e3a851390fd3bb51cc261988661a54a39105daeb8d9f1b8f9d",
    "tasks": [
      "model_maintenance"
    ],
    "workflows": [],
    "platforms": null,
    "role": "workflow",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/f205371baee8731988c8857ead7ffe23b67c501c/skills/rdk-model-zoo-integrate/SKILL.md"
  },
  {
    "name": "rdk-model-zoo-release",
    "fingerprint": "9b54d138c781874dd3a4f049813515e88f406016dc18385d4432b448e9483752",
    "tasks": [
      "model_maintenance"
    ],
    "workflows": [],
    "platforms": null,
    "role": "workflow",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/f205371baee8731988c8857ead7ffe23b67c501c/skills/rdk-model-zoo-release/SKILL.md"
  },
  {
    "name": "rdk-model-zoo-repo",
    "fingerprint": "9041cbe35525d5e3b689482fc689e2e80a5034e6d64291cfac747d478a59dfcf",
    "tasks": [
      "model_maintenance"
    ],
    "workflows": [],
    "platforms": null,
    "role": "entry",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/f205371baee8731988c8857ead7ffe23b67c501c/skills/rdk-model-zoo-repo/SKILL.md"
  },
  {
    "name": "rdk-model-zoo-review",
    "fingerprint": "3e7d82784fb92ac70811c89fea89e50b768dd2a52a060fc7a352be94f86a292e",
    "tasks": [
      "model_maintenance"
    ],
    "workflows": [],
    "platforms": null,
    "role": "workflow",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/f205371baee8731988c8857ead7ffe23b67c501c/skills/rdk-model-zoo-review/SKILL.md"
  },
  {
    "name": "rdk-model-zoo-validate",
    "fingerprint": "d0060ef09d1901813e6fda85085770da433d0f0d6b456b87da96fafa83a6fb18",
    "tasks": [
      "model_maintenance"
    ],
    "workflows": [],
    "platforms": null,
    "role": "workflow",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/f205371baee8731988c8857ead7ffe23b67c501c/skills/rdk-model-zoo-validate/SKILL.md"
  },
  {
    "name": "rdk-multimedia",
    "fingerprint": "f57d6a9b2511eedb0a13e96e60279eec0b95b9b5b6375236479776bb3e1ca84a",
    "tasks": [
      "camera"
    ],
    "workflows": [],
    "platforms": null,
    "role": "workflow",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/f205371baee8731988c8857ead7ffe23b67c501c/skills/rdk-multimedia/SKILL.md"
  },
  {
    "name": "rdk-peripheral-cookbook",
    "fingerprint": "be0c93a9fc5421627263c76555bfb80e685f11d51bc877fa9d9f60544efbd9d7",
    "tasks": [
      "gpio",
      "uart"
    ],
    "workflows": [],
    "platforms": null,
    "role": "workflow",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/f205371baee8731988c8857ead7ffe23b67c501c/skills/rdk-peripheral-cookbook/SKILL.md"
  },
  {
    "name": "rdk-vision-pipeline",
    "fingerprint": "b117d270c95f8dde22038490120ffb9d1e7b4f2e75b00bc505643c2573c6801a",
    "tasks": [
      "camera"
    ],
    "workflows": [],
    "platforms": null,
    "role": "workflow",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/f205371baee8731988c8857ead7ffe23b67c501c/skills/rdk-vision-pipeline/SKILL.md"
  },
  {
    "name": "ucp",
    "fingerprint": "23568256413604bfa723e7be8c8ddc581bab1b68f3e733d81502eebfc4721fb5",
    "tasks": [
      "model_deploy"
    ],
    "workflows": [],
    "platforms": [
      "s100",
      "s100p",
      "s600"
    ],
    "role": "entry",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/f205371baee8731988c8857ead7ffe23b67c501c/skills/oe-skills-s/skills/ucp/SKILL.md"
  },
  {
    "name": "x5-accuracy-diagnostics",
    "fingerprint": "3d21f74d79ffa053de8e440ffe55a71580542cddaaacd26c3b443c0b9fdc7ca2",
    "tasks": [
      "diagnostics"
    ],
    "workflows": [],
    "platforms": [
      "x5"
    ],
    "role": "workflow",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/f205371baee8731988c8857ead7ffe23b67c501c/skills/oe-skills-x5/skills/x5-accuracy-diagnostics/SKILL.md"
  },
  {
    "name": "x5-bpu-python-api",
    "fingerprint": "0a094375155bb2235d44e6f8007be5f0957232f1c481a26081945d10480c72b0",
    "tasks": [
      "model_deploy"
    ],
    "workflows": [],
    "platforms": [
      "x5"
    ],
    "role": "workflow",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/f205371baee8731988c8857ead7ffe23b67c501c/skills/oe-skills-x5/skills/x5-bpu-python-api/SKILL.md"
  },
  {
    "name": "x5-calibration-data-prepare",
    "fingerprint": "c6154528f41ed15081b4041d32e004fc5ac588d6b624050d59150e60aae0f7b4",
    "tasks": [
      "model_conversion"
    ],
    "workflows": [
      "ptq"
    ],
    "platforms": [
      "x5"
    ],
    "role": "step",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/f205371baee8731988c8857ead7ffe23b67c501c/skills/oe-skills-x5/skills/x5-calibration-data-prepare/SKILL.md"
  },
  {
    "name": "x5-consistency-diagnostics",
    "fingerprint": "7b9bc464ec951291abdb6e9fe15e8160bc5609e96a8fa5511b446c294aa4b866",
    "tasks": [
      "diagnostics"
    ],
    "workflows": [],
    "platforms": [
      "x5"
    ],
    "role": "workflow",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/f205371baee8731988c8857ead7ffe23b67c501c/skills/oe-skills-x5/skills/x5-consistency-diagnostics/SKILL.md"
  },
  {
    "name": "x5-environment-install",
    "fingerprint": "a742a9b4fe261ffdb4558a107fd51d24ffd0b3f2def5a5c79812dcb06771f5fe",
    "tasks": [
      "environment"
    ],
    "workflows": [],
    "platforms": [
      "x5"
    ],
    "role": "workflow",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/f205371baee8731988c8857ead7ffe23b67c501c/skills/oe-skills-x5/skills/x5-environment-install/SKILL.md"
  },
  {
    "name": "x5-environment-probe",
    "fingerprint": "9ae8a68aa3161671fdb6de38bb9741fed9e1396cf7ee23608f4ce2e491f29c78",
    "tasks": [
      "environment"
    ],
    "workflows": [],
    "platforms": [
      "x5"
    ],
    "role": "workflow",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/f205371baee8731988c8857ead7ffe23b67c501c/skills/oe-skills-x5/skills/x5-environment-probe/SKILL.md"
  },
  {
    "name": "x5-environment-setup",
    "fingerprint": "d4d031bc5e8bcbe4d8d426c37d82ccb69edbe92b227771fc161b0036da904177",
    "tasks": [
      "environment"
    ],
    "workflows": [],
    "platforms": [
      "x5"
    ],
    "role": "workflow",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/f205371baee8731988c8857ead7ffe23b67c501c/skills/oe-skills-x5/skills/x5-environment-setup/SKILL.md"
  },
  {
    "name": "x5-model-diagnostics",
    "fingerprint": "e50bda5fa18068e9c2f458454a93721852cd3f1a9a7cb5d5b9e9eec6879a708d",
    "tasks": [
      "diagnostics"
    ],
    "workflows": [],
    "platforms": [
      "x5"
    ],
    "role": "workflow",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/f205371baee8731988c8857ead7ffe23b67c501c/skills/oe-skills-x5/skills/x5-model-diagnostics/SKILL.md"
  },
  {
    "name": "x5-model-preflight",
    "fingerprint": "d1ec7dc03e2fc5e2e6131d50c5b6fc3da5eac37078e89c18af53c30f58c914dc",
    "tasks": [
      "model_conversion"
    ],
    "workflows": [
      "ptq"
    ],
    "platforms": [
      "x5"
    ],
    "role": "step",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/f205371baee8731988c8857ead7ffe23b67c501c/skills/oe-skills-x5/skills/x5-model-preflight/SKILL.md"
  },
  {
    "name": "x5-performance-diagnostics",
    "fingerprint": "6033495fde3a78414409a710378a5533a866f40786f298abad4f2f398fc296d1",
    "tasks": [
      "diagnostics"
    ],
    "workflows": [],
    "platforms": [
      "x5"
    ],
    "role": "workflow",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/f205371baee8731988c8857ead7ffe23b67c501c/skills/oe-skills-x5/skills/x5-performance-diagnostics/SKILL.md"
  },
  {
    "name": "x5-ptq-compile",
    "fingerprint": "9382197c3b8afb957612f050dc702046336543e565b97dbe7d05df97e763f50a",
    "tasks": [
      "model_conversion",
      "model_compile"
    ],
    "workflows": [
      "ptq"
    ],
    "platforms": [
      "x5"
    ],
    "role": "step",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/f205371baee8731988c8857ead7ffe23b67c501c/skills/oe-skills-x5/skills/x5-ptq-compile/SKILL.md"
  },
  {
    "name": "x5-ptq-config-authoring",
    "fingerprint": "270cc129ef375e43b69609f5f24fa84a4fc7cbe0efc10694315e60197df19ad3",
    "tasks": [
      "model_conversion"
    ],
    "workflows": [
      "ptq"
    ],
    "platforms": [
      "x5"
    ],
    "role": "step",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/f205371baee8731988c8857ead7ffe23b67c501c/skills/oe-skills-x5/skills/x5-ptq-config-authoring/SKILL.md"
  },
  {
    "name": "x5-ptq-deploy",
    "fingerprint": "aa88095ddef2a22bcedeb79eadbe441066d0ac8fac86391d73e19de504aaec09",
    "tasks": [
      "model_conversion"
    ],
    "workflows": [
      "ptq"
    ],
    "platforms": [
      "x5"
    ],
    "role": "workflow",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/f205371baee8731988c8857ead7ffe23b67c501c/skills/oe-skills-x5/skills/x5-ptq-deploy/SKILL.md"
  },
  {
    "name": "x5-qat-adaptation",
    "fingerprint": "9c6b4cf5ebadc797fb8fc51303d56a33ac49e86fe1cc59ba4fe86a61df2964a1",
    "tasks": [
      "model_conversion"
    ],
    "workflows": [
      "qat"
    ],
    "platforms": [
      "x5"
    ],
    "role": "step",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/f205371baee8731988c8857ead7ffe23b67c501c/skills/oe-skills-x5/skills/x5-qat-adaptation/SKILL.md"
  },
  {
    "name": "x5-qat-compile",
    "fingerprint": "353a6998137c7564f24a9eef188436aacc7e421940763c5e58fe9de96a2aabfa",
    "tasks": [
      "model_conversion",
      "model_compile"
    ],
    "workflows": [
      "qat"
    ],
    "platforms": [
      "x5"
    ],
    "role": "step",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/f205371baee8731988c8857ead7ffe23b67c501c/skills/oe-skills-x5/skills/x5-qat-compile/SKILL.md"
  },
  {
    "name": "x5-qat-deploy",
    "fingerprint": "9beff4b1e109d216a06903041161c520ceb210ab4b0b7588c0d91b3021a55586",
    "tasks": [
      "model_conversion"
    ],
    "workflows": [
      "qat"
    ],
    "platforms": [
      "x5"
    ],
    "role": "workflow",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/f205371baee8731988c8857ead7ffe23b67c501c/skills/oe-skills-x5/skills/x5-qat-deploy/SKILL.md"
  },
  {
    "name": "x5-qat-training",
    "fingerprint": "f365e0c81d89c46019a5d85f0b4a8cdc8ef55d62795aa2589f1acfdef6c1fa83",
    "tasks": [
      "model_conversion"
    ],
    "workflows": [
      "qat"
    ],
    "platforms": [
      "x5"
    ],
    "role": "step",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/f205371baee8731988c8857ead7ffe23b67c501c/skills/oe-skills-x5/skills/x5-qat-training/SKILL.md"
  },
  {
    "name": "x5-router",
    "fingerprint": "3041344e30462025cb39050347b5e88c4d0af4cd4317e17a858d65eb295796f6",
    "tasks": [
      "model_conversion"
    ],
    "workflows": [],
    "platforms": [
      "x5"
    ],
    "role": "entry",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/f205371baee8731988c8857ead7ffe23b67c501c/skills/oe-skills-x5/skills/x5-router/SKILL.md"
  },
  {
    "name": "x5-runtime-cpp-infer",
    "fingerprint": "6e7e295489d462204b6b8e7ad4dff721d30dfd882ca8125321751d8c8a712c6f",
    "tasks": [
      "model_deploy"
    ],
    "workflows": [],
    "platforms": [
      "x5"
    ],
    "role": "workflow",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/f205371baee8731988c8857ead7ffe23b67c501c/skills/oe-skills-x5/skills/x5-runtime-cpp-infer/SKILL.md"
  },
  {
    "name": "x5-runtime-deploy",
    "fingerprint": "2a9c8da36f74eb6581a6021513235dcabf565b575e784d0b40e180a64afc7d1b",
    "tasks": [
      "model_deploy"
    ],
    "workflows": [],
    "platforms": [
      "x5"
    ],
    "role": "workflow",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/f205371baee8731988c8857ead7ffe23b67c501c/skills/oe-skills-x5/skills/x5-runtime-deploy/SKILL.md"
  },
  {
    "name": "rdk-network-remote",
    "fingerprint": "09704b9a1e6009e5e039d37da01d3da7f550749e82b89df8378567f86d9667df",
    "tasks": [
      "network",
      "diagnostics"
    ],
    "workflows": [],
    "platforms": null,
    "role": "entry",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/f205371baee8731988c8857ead7ffe23b67c501c/skills/rdk-network-remote/SKILL.md"
  },
  {
    "name": "x5-board-monitor",
    "fingerprint": "021943abaca2adef325b5d47883dad20c303b6be640a9061a2fd1aa62f1cf4a8",
    "tasks": [
      "diagnostics"
    ],
    "workflows": [],
    "platforms": [
      "x5"
    ],
    "role": "step",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/f205371baee8731988c8857ead7ffe23b67c501c/skills/oe-skills-x5/skills/x5-board-monitor/SKILL.md"
  },
  {
    "name": "s-board-monitor",
    "fingerprint": "754ed2d2a2ae9aa37f099522835225164cc4308543d48cc23796ec6e100bb72b",
    "tasks": [
      "diagnostics"
    ],
    "workflows": [],
    "platforms": [
      "s100",
      "s100p",
      "s600"
    ],
    "role": "step",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/f205371baee8731988c8857ead7ffe23b67c501c/skills/oe-skills-s/skills/ucp/s-board-monitor/SKILL.md"
  }
] as const;
