// Reviewed catalog overlay. Exact content fingerprint prevents stale classifications.
// Classification is search scope, not proof of hardware compatibility.
// 2026-09-22 additions reviewed against skills-reviewed.json descriptions at 08d0a46:
// x5-ptq-compile: checker/makertbin produces verified bayes-e .bin artifacts.
// x5-qat-compile: trace/check_model/compile_model/export_hbir produces .hbm/.hbir.
// j6-hbdk-compile: generic YAML-driven ONNX/BC model compilation.
// j6-hbdk-export-compile: export/convert/compile of already-quantized models.
// rdk-network-remote: SSH, WiFi, wired network and remote-access diagnostics;
//   description names no exact board set, so platform scope remains unknown.
// x5-board-monitor: explicit X5 resource snapshots and performance anomalies.
// j6-board-monitor: explicit S-series BPU/DDR/memory monitoring (reviewed S pack).
// These additions extend only the reviewed subset; they do not cover the catalog.
export const TAXONOMY_DATA = [
  {
    "name": "__SKILL_j6-plugin-__adaptation",
    "fingerprint": "e0019e63a20dcb8f5c3b2eea6c2507e2dc8b13506c65c3aa42abdb586c3e7e9f",
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
    "source": "https://github.com/D-Robotics/rdk-skills/blob/08d0a466413f11bbc045ba5e51f626bdb0346373/skills/oe-skills-s/skills/plugin/j6-plugin-adaptation/SKILL.md"
  },
  {
    "name": "__SKILL_j6-plugin-__consistency-debug",
    "fingerprint": "4257c242928d3ea369093cb18a995bf27e370618b877661c1ff69f493b960968",
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
    "source": "https://github.com/D-Robotics/rdk-skills/blob/08d0a466413f11bbc045ba5e51f626bdb0346373/skills/oe-skills-s/skills/plugin/j6-plugin-consistency-debug/SKILL.md"
  },
  {
    "name": "__SKILL_j6-plugin-__dynamic-block",
    "fingerprint": "251e08ef0ef41c4c166dfe53d9b8bbb07930b8c2e5e7e336c6ffaeec6870c204",
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
    "source": "https://github.com/D-Robotics/rdk-skills/blob/08d0a466413f11bbc045ba5e51f626bdb0346373/skills/oe-skills-s/skills/plugin/j6-plugin-adaptation/j6-plugin-dynamic-block/SKILL.md"
  },
  {
    "name": "__SKILL_j6-plugin-__export",
    "fingerprint": "a9e4144afb766f424303907dbe180e9a92efd984369ea78598d3cbe94d7fbc41",
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
    "source": "https://github.com/D-Robotics/rdk-skills/blob/08d0a466413f11bbc045ba5e51f626bdb0346373/skills/oe-skills-s/skills/plugin/j6-plugin-export/SKILL.md"
  },
  {
    "name": "__SKILL_j6-plugin-__graph-diff",
    "fingerprint": "eb1c4353e8bf9194ec8895f7b298510b6f06c19184ad76ec42cde69d78ada37e",
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
    "source": "https://github.com/D-Robotics/rdk-skills/blob/08d0a466413f11bbc045ba5e51f626bdb0346373/skills/oe-skills-s/skills/plugin/j6-plugin-graph-diff/SKILL.md"
  },
  {
    "name": "__SKILL_j6-plugin-__hbdk-generating",
    "fingerprint": "5d90ab778ed02e46c8fab553b6ee62015157e037f6577b42b93adead094ffd9b",
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
    "source": "https://github.com/D-Robotics/rdk-skills/blob/08d0a466413f11bbc045ba5e51f626bdb0346373/skills/oe-skills-s/skills/plugin/j6-plugin-hbdk-generating/SKILL.md"
  },
  {
    "name": "__SKILL_j6-plugin-__insert-quant-dequant",
    "fingerprint": "5ecd1d462565ff17e720a5adc7fb13bc3fdb8c727a664777f67a88c3e930d57f",
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
    "source": "https://github.com/D-Robotics/rdk-skills/blob/08d0a466413f11bbc045ba5e51f626bdb0346373/skills/oe-skills-s/skills/plugin/j6-plugin-adaptation/j6-plugin-insert-quant-dequant/SKILL.md"
  },
  {
    "name": "__SKILL_j6-plugin-__model-check-result",
    "fingerprint": "d47558de49d699723c9d30beb0a0404fdc26105bec6f2f7f1e593a910b5c12cb",
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
    "source": "https://github.com/D-Robotics/rdk-skills/blob/08d0a466413f11bbc045ba5e51f626bdb0346373/skills/oe-skills-s/skills/plugin/j6-plugin-model-check-result/SKILL.md"
  },
  {
    "name": "__SKILL_j6-plugin-__precision-tuning",
    "fingerprint": "738502e36407f9d11b7fd4e6da1e161afc9effa2041830392e3af9fd936ebeea",
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
    "source": "https://github.com/D-Robotics/rdk-skills/blob/08d0a466413f11bbc045ba5e51f626bdb0346373/skills/oe-skills-s/skills/plugin/j6-plugin-precision-tuning/SKILL.md"
  },
  {
    "name": "__SKILL_j6-plugin-__prepare",
    "fingerprint": "f9afea5c4141ed6842afaa1e57b957817e6ead0165be32a1daeb15fceee953a2",
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
    "source": "https://github.com/D-Robotics/rdk-skills/blob/08d0a466413f11bbc045ba5e51f626bdb0346373/skills/oe-skills-s/skills/plugin/j6-plugin-adaptation/j6-plugin-prepare/SKILL.md"
  },
  {
    "name": "__SKILL_j6-plugin-__quantization",
    "fingerprint": "1ead4c04d9f0c7b4d232fe412cd02250ae65b147c94c6762287039366771d0e1",
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
    "source": "https://github.com/D-Robotics/rdk-skills/blob/08d0a466413f11bbc045ba5e51f626bdb0346373/skills/oe-skills-s/skills/plugin/j6-plugin-hbdk-generating/j6-plugin-quantization/SKILL.md"
  },
  {
    "name": "__SKILL_j6-plugin-__set-fake-quantize",
    "fingerprint": "a2fa6eb66a5ec54860b0abb095b9b208dc3637c9c17a3323a7643dcb99086c9e",
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
    "source": "https://github.com/D-Robotics/rdk-skills/blob/08d0a466413f11bbc045ba5e51f626bdb0346373/skills/oe-skills-s/skills/plugin/j6-plugin-adaptation/j6-plugin-set-fake-quantize/SKILL.md"
  },
  {
    "name": "__SKILL_j6-plugin-__set-march",
    "fingerprint": "96b2882bb487dca2081c6619a47d21c8c27d3a129e51cdc3e1912235e013dc3a",
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
    "source": "https://github.com/D-Robotics/rdk-skills/blob/08d0a466413f11bbc045ba5e51f626bdb0346373/skills/oe-skills-s/skills/plugin/j6-plugin-adaptation/j6-plugin-set-march/SKILL.md"
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
    "source": "https://github.com/D-Robotics/rdk-skills/blob/08d0a466413f11bbc045ba5e51f626bdb0346373/skills/bsp-bootloader-build/SKILL.md"
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
    "source": "https://github.com/D-Robotics/rdk-skills/blob/08d0a466413f11bbc045ba5e51f626bdb0346373/skills/bsp-deb-build/SKILL.md"
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
    "source": "https://github.com/D-Robotics/rdk-skills/blob/08d0a466413f11bbc045ba5e51f626bdb0346373/skills/bsp-env-setup/SKILL.md"
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
    "source": "https://github.com/D-Robotics/rdk-skills/blob/08d0a466413f11bbc045ba5e51f626bdb0346373/skills/bsp-image-build/SKILL.md"
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
    "source": "https://github.com/D-Robotics/rdk-skills/blob/08d0a466413f11bbc045ba5e51f626bdb0346373/skills/bsp-kernel-build/SKILL.md"
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
    "source": "https://github.com/D-Robotics/rdk-skills/blob/08d0a466413f11bbc045ba5e51f626bdb0346373/skills/bsp-rootfs-custom/SKILL.md"
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
    "source": "https://github.com/D-Robotics/rdk-skills/blob/08d0a466413f11bbc045ba5e51f626bdb0346373/skills/bsp-s-series/SKILL.md"
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
    "source": "https://github.com/D-Robotics/rdk-skills/blob/08d0a466413f11bbc045ba5e51f626bdb0346373/skills/bsp-source-sync/SKILL.md"
  },
  {
    "name": "hmct-workflow",
    "fingerprint": "b56c5ba4597057e303c200a0ad1a3a3b9510e3817b4fc45bcdf62d29c737a457",
    "tasks": [
      "model_conversion"
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
    "source": "https://github.com/D-Robotics/rdk-skills/blob/08d0a466413f11bbc045ba5e51f626bdb0346373/skills/oe-skills-s/skills/hmct/SKILL.md"
  },
  {
    "name": "horizon-router",
    "fingerprint": "4673b52b6290ad8188cb4208960254b224d735bee85dffe770df7afaa9ffc609",
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
    "source": "https://github.com/D-Robotics/rdk-skills/blob/08d0a466413f11bbc045ba5e51f626bdb0346373/skills/oe-skills-s/skills/horizon-router/SKILL.md"
  },
  {
    "name": "j6-hbdk-compile",
    "fingerprint": "df7347b9c2bd044f52e2819934f588c347a16a886dec9c2e999b5f9ff59a633b",
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
    "role": "step",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/08d0a466413f11bbc045ba5e51f626bdb0346373/skills/oe-skills-s/skills/hbdk/j6-hbdk-compile/SKILL.md"
  },
  {
    "name": "j6-hbdk-export-compile",
    "fingerprint": "fee308e3600d94711d07300f98c679b72101eeb2353f186790b1f24230602b2b",
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
    "source": "https://github.com/D-Robotics/rdk-skills/blob/08d0a466413f11bbc045ba5e51f626bdb0346373/skills/oe-skills-s/skills/plugin/j6-plugin-hbdk-generating/j6-hbdk-export-compile/SKILL.md"
  },
  {
    "name": "j6-ucp-hbm-infer",
    "fingerprint": "5f9ccb0e8afc3efd153b050ce7a6fe8718de3d78d569f81c5a8bf4019e18acc1",
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
    "source": "https://github.com/D-Robotics/rdk-skills/blob/08d0a466413f11bbc045ba5e51f626bdb0346373/skills/oe-skills-s/skills/ucp/j6-ucp-hbm-infer/SKILL.md"
  },
  {
    "name": "j6-ucp-infer-generating",
    "fingerprint": "95e7eede18eaea34ec6cd1b6788f614cdb3a47fcc51236f0a4c1079d90b7f3ed",
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
    "source": "https://github.com/D-Robotics/rdk-skills/blob/08d0a466413f11bbc045ba5e51f626bdb0346373/skills/oe-skills-s/skills/ucp/j6-ucp-infer-generating/SKILL.md"
  },
  {
    "name": "oe-package-detection",
    "fingerprint": "c383e6cceb48ac460cac8eb0004818426a8f2c8a458fbf0fa38c5eeae29c82bb",
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
    "source": "https://github.com/D-Robotics/rdk-skills/blob/08d0a466413f11bbc045ba5e51f626bdb0346373/skills/oe-skills-s/skills/horizon-router/oe-package-detection/SKILL.md"
  },
  {
    "name": "oe-package-install",
    "fingerprint": "a9de576a5a73f583bb6fb988993277070954a6e5d9b32d06f892a8ff7a0f4309",
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
    "source": "https://github.com/D-Robotics/rdk-skills/blob/08d0a466413f11bbc045ba5e51f626bdb0346373/skills/oe-skills-s/skills/horizon-router/oe-package-install/SKILL.md"
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
    "source": "https://github.com/D-Robotics/rdk-skills/blob/08d0a466413f11bbc045ba5e51f626bdb0346373/skills/rdk-accessories/SKILL.md"
  },
  {
    "name": "rdk-board-knowledge",
    "fingerprint": "86efbfe60d6f8f6b2b1d2e8457bf3a872cb898765358dd07d2a146a349e26b46",
    "tasks": [
      "diagnostics"
    ],
    "workflows": [],
    "platforms": null,
    "role": "workflow",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/08d0a466413f11bbc045ba5e51f626bdb0346373/skills/rdk-board-knowledge/SKILL.md"
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
    "source": "https://github.com/D-Robotics/rdk-skills/blob/08d0a466413f11bbc045ba5e51f626bdb0346373/skills/rdk-camera-setup/SKILL.md"
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
    "source": "https://github.com/D-Robotics/rdk-skills/blob/08d0a466413f11bbc045ba5e51f626bdb0346373/skills/rdk-diagnostic/SKILL.md"
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
    "source": "https://github.com/D-Robotics/rdk-skills/blob/08d0a466413f11bbc045ba5e51f626bdb0346373/skills/rdk-gpio-40pin/SKILL.md"
  },
  {
    "name": "rdk-hardware",
    "fingerprint": "3f4b6220884b804ce0f8cb48b9bedab9c9ced02801cabaff1eb0e5ae6b826a10",
    "tasks": [
      "gpio"
    ],
    "workflows": [],
    "platforms": null,
    "role": "entry",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/08d0a466413f11bbc045ba5e51f626bdb0346373/skills/rdk-hardware/SKILL.md"
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
    "source": "https://github.com/D-Robotics/rdk-skills/blob/08d0a466413f11bbc045ba5e51f626bdb0346373/skills/rdk-log-forensics/SKILL.md"
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
    "source": "https://github.com/D-Robotics/rdk-skills/blob/08d0a466413f11bbc045ba5e51f626bdb0346373/skills/rdk-model-deploy/SKILL.md"
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
    "source": "https://github.com/D-Robotics/rdk-skills/blob/08d0a466413f11bbc045ba5e51f626bdb0346373/skills/rdk-model-zoo/SKILL.md"
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
    "source": "https://github.com/D-Robotics/rdk-skills/blob/08d0a466413f11bbc045ba5e51f626bdb0346373/skills/rdk-model-zoo-develop/SKILL.md"
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
    "source": "https://github.com/D-Robotics/rdk-skills/blob/08d0a466413f11bbc045ba5e51f626bdb0346373/skills/rdk-model-zoo-integrate/SKILL.md"
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
    "source": "https://github.com/D-Robotics/rdk-skills/blob/08d0a466413f11bbc045ba5e51f626bdb0346373/skills/rdk-model-zoo-release/SKILL.md"
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
    "source": "https://github.com/D-Robotics/rdk-skills/blob/08d0a466413f11bbc045ba5e51f626bdb0346373/skills/rdk-model-zoo-repo/SKILL.md"
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
    "source": "https://github.com/D-Robotics/rdk-skills/blob/08d0a466413f11bbc045ba5e51f626bdb0346373/skills/rdk-model-zoo-review/SKILL.md"
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
    "source": "https://github.com/D-Robotics/rdk-skills/blob/08d0a466413f11bbc045ba5e51f626bdb0346373/skills/rdk-model-zoo-validate/SKILL.md"
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
    "source": "https://github.com/D-Robotics/rdk-skills/blob/08d0a466413f11bbc045ba5e51f626bdb0346373/skills/rdk-multimedia/SKILL.md"
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
    "source": "https://github.com/D-Robotics/rdk-skills/blob/08d0a466413f11bbc045ba5e51f626bdb0346373/skills/rdk-peripheral-cookbook/SKILL.md"
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
    "source": "https://github.com/D-Robotics/rdk-skills/blob/08d0a466413f11bbc045ba5e51f626bdb0346373/skills/rdk-vision-pipeline/SKILL.md"
  },
  {
    "name": "ucp",
    "fingerprint": "1fccad3faa7e28e300832705919acf3783c1448f40c1d98f5f4259ec3c02c50d",
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
    "source": "https://github.com/D-Robotics/rdk-skills/blob/08d0a466413f11bbc045ba5e51f626bdb0346373/skills/oe-skills-s/skills/ucp/SKILL.md"
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
    "source": "https://github.com/D-Robotics/rdk-skills/blob/08d0a466413f11bbc045ba5e51f626bdb0346373/skills/oe-skills-x5/skills/x5-accuracy-diagnostics/SKILL.md"
  },
  {
    "name": "x5-bpu-python-api",
    "fingerprint": "bd57e0113d6942e8a0a6b83c8d79b7183d8a50eca4a1d8a257c2d213b3e0f79b",
    "tasks": [
      "model_deploy"
    ],
    "workflows": [],
    "platforms": [
      "x5"
    ],
    "role": "workflow",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/08d0a466413f11bbc045ba5e51f626bdb0346373/skills/oe-skills-x5/skills/x5-bpu-python-api/SKILL.md"
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
    "source": "https://github.com/D-Robotics/rdk-skills/blob/08d0a466413f11bbc045ba5e51f626bdb0346373/skills/oe-skills-x5/skills/x5-calibration-data-prepare/SKILL.md"
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
    "source": "https://github.com/D-Robotics/rdk-skills/blob/08d0a466413f11bbc045ba5e51f626bdb0346373/skills/oe-skills-x5/skills/x5-consistency-diagnostics/SKILL.md"
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
    "source": "https://github.com/D-Robotics/rdk-skills/blob/08d0a466413f11bbc045ba5e51f626bdb0346373/skills/oe-skills-x5/skills/x5-environment-install/SKILL.md"
  },
  {
    "name": "x5-environment-probe",
    "fingerprint": "faa903324258ecee4c18e12320972e5d8c458ea6a4d6e502a4b3c6159ed06f09",
    "tasks": [
      "environment"
    ],
    "workflows": [],
    "platforms": [
      "x5"
    ],
    "role": "workflow",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/08d0a466413f11bbc045ba5e51f626bdb0346373/skills/oe-skills-x5/skills/x5-environment-probe/SKILL.md"
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
    "source": "https://github.com/D-Robotics/rdk-skills/blob/08d0a466413f11bbc045ba5e51f626bdb0346373/skills/oe-skills-x5/skills/x5-environment-setup/SKILL.md"
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
    "source": "https://github.com/D-Robotics/rdk-skills/blob/08d0a466413f11bbc045ba5e51f626bdb0346373/skills/oe-skills-x5/skills/x5-model-diagnostics/SKILL.md"
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
    "source": "https://github.com/D-Robotics/rdk-skills/blob/08d0a466413f11bbc045ba5e51f626bdb0346373/skills/oe-skills-x5/skills/x5-model-preflight/SKILL.md"
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
    "source": "https://github.com/D-Robotics/rdk-skills/blob/08d0a466413f11bbc045ba5e51f626bdb0346373/skills/oe-skills-x5/skills/x5-performance-diagnostics/SKILL.md"
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
    "source": "https://github.com/D-Robotics/rdk-skills/blob/08d0a466413f11bbc045ba5e51f626bdb0346373/skills/oe-skills-x5/skills/x5-ptq-compile/SKILL.md"
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
    "source": "https://github.com/D-Robotics/rdk-skills/blob/08d0a466413f11bbc045ba5e51f626bdb0346373/skills/oe-skills-x5/skills/x5-ptq-config-authoring/SKILL.md"
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
    "source": "https://github.com/D-Robotics/rdk-skills/blob/08d0a466413f11bbc045ba5e51f626bdb0346373/skills/oe-skills-x5/skills/x5-ptq-deploy/SKILL.md"
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
    "source": "https://github.com/D-Robotics/rdk-skills/blob/08d0a466413f11bbc045ba5e51f626bdb0346373/skills/oe-skills-x5/skills/x5-qat-adaptation/SKILL.md"
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
    "source": "https://github.com/D-Robotics/rdk-skills/blob/08d0a466413f11bbc045ba5e51f626bdb0346373/skills/oe-skills-x5/skills/x5-qat-compile/SKILL.md"
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
    "source": "https://github.com/D-Robotics/rdk-skills/blob/08d0a466413f11bbc045ba5e51f626bdb0346373/skills/oe-skills-x5/skills/x5-qat-deploy/SKILL.md"
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
    "source": "https://github.com/D-Robotics/rdk-skills/blob/08d0a466413f11bbc045ba5e51f626bdb0346373/skills/oe-skills-x5/skills/x5-qat-training/SKILL.md"
  },
  {
    "name": "x5-router",
    "fingerprint": "8241560539f5048fe968c6e6bc43391a01e5eedff4854acecff07012ced10f10",
    "tasks": [
      "model_conversion"
    ],
    "workflows": [],
    "platforms": [
      "x5"
    ],
    "role": "entry",
    "source": "https://github.com/D-Robotics/rdk-skills/blob/08d0a466413f11bbc045ba5e51f626bdb0346373/skills/oe-skills-x5/skills/x5-router/SKILL.md"
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
    "source": "https://github.com/D-Robotics/rdk-skills/blob/08d0a466413f11bbc045ba5e51f626bdb0346373/skills/oe-skills-x5/skills/x5-runtime-cpp-infer/SKILL.md"
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
    "source": "https://github.com/D-Robotics/rdk-skills/blob/08d0a466413f11bbc045ba5e51f626bdb0346373/skills/oe-skills-x5/skills/x5-runtime-deploy/SKILL.md"
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
    "source": "https://github.com/D-Robotics/rdk-skills/blob/08d0a466413f11bbc045ba5e51f626bdb0346373/skills/rdk-network-remote/SKILL.md"
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
    "source": "https://github.com/D-Robotics/rdk-skills/blob/08d0a466413f11bbc045ba5e51f626bdb0346373/skills/oe-skills-x5/skills/x5-board-monitor/SKILL.md"
  },
  {
    "name": "j6-board-monitor",
    "fingerprint": "749f33b95e8366611926be13e2ff87f6785ac097a21ad0f97362554c9c0fcab7",
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
    "source": "https://github.com/D-Robotics/rdk-skills/blob/08d0a466413f11bbc045ba5e51f626bdb0346373/skills/oe-skills-s/skills/ucp/j6-board-monitor/SKILL.md"
  }
] as const;
