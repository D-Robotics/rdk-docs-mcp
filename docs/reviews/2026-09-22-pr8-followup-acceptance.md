# PR #8 follow-up acceptance — 2026-09-22

Fixes: existence questions versus negation; bounded negation before affirmative clauses; model-domain gating for generic ready phrases; already/pre-quantized terminology; post-training PTQ terminology; model-library release concept preservation; undecided model conversion guidance.

12 new intent cases failed before implementation. Final unit suite: 268 passed. Build passed. Live skills: 14/14 passed. Live documentation retrieval: 57/57 passed (final answer quality not evaluated). Expanded MCP smoke: 34 queries completed; the six blocking categories from the prior report now produce the expected intent/routing. Separate holdout wording checked for model lookup and peripheral setup.

Limits: deterministic phrase matching is not universal language understanding; lower-ranked candidates can remain broad. Unknown board scope is explicitly unknown. PTQ/QAT comparison intentionally retains both candidates. No npm release or merge performed.

| Query | guidance | Top result |
| --- | --- | --- |
| {'query': 'X5 有没有已经量化好的模型'} | default | rdk-model-zoo |
| {'query': '找一个能直接跑的官方模型'} | default | rdk-model-zoo |
| {'query': '下载官方模型'} | default | rdk-model-zoo |
| {'query': 'X5 模型库'} | default | rdk-model-zoo |
| {'query': 'already quantized models for X5'} | default | rdk-model-zoo |
| {'query': 'pre-quantized model zoo'} | default | rdk-model-zoo |
| {'query': 'X5 不想训练，只想找现成模型'} | default | rdk-model-zoo |
| {'query': '不要现成模型，我要自己量化'} | ambiguous_quant | __SKILL_j6-plugin-__hbdk-generating |
| {'query': '不要现成模型我要自己量化'} | ambiguous_quant | __SKILL_j6-plugin-__hbdk-generating |
| {'query': '不量化，只部署现成模型'} | default | rdk-model-zoo |
| {'query': 'X5 训练后量化 PTQ'} | default | x5-ptq-deploy |
| {'query': 'X5 post training quantization'} | default | x5-ptq-deploy |
| {'query': 'X5 量化感知训练'} | default | x5-qat-training |
| {'query': 'X5 不用 QAT，直接 PTQ'} | default | x5-ptq-deploy |
| {'query': 'X5 QAT，不要 PTQ'} | default | x5-qat-deploy |
| {'query': 'PTQ 和 QAT 有什么区别'} | default | x5-ptq-deploy |
| {'query': '想找现成模型，也想自己量化比较一下'} | ambiguous_quant | hmct-workflow |
| {'query': 'X5 摄像头直接用'} | default | rdk-camera-setup |
| {'query': 'X5 GPIO 有没有现成例子'} | default | rdk-gpio-40pin |
| {'query': 'X5 串口开箱即用'} | default | rdk-gpio-40pin |
| {'query': 'X5 点灯'} | default | rdk-gpio-40pin |
| {'query': 'S100 PTQ 部署'} | default | rdk-model-deploy |
| {'query': 'S600 量化模型'} | ambiguous_quant | hmct-workflow |
| {'query': 'X3 PTQ 部署'} | default | rdk-model-deploy |
| {'query': '!!!'} | invalid_input | (none) |
| {'query': '123456'} | invalid_input | (none) |
| {'query': '怎么弄'} | invalid_input | (none) |
| {'query': 'X5'} | model_only | x5-environment-setup |
| {'query': '模型库发版流程'} | default | rdk-model-zoo-release |
| {'query': 'X5 ONNX 转换 hbm'} | ambiguous_quant | x5-router |
| {'query': 'X5 和 S100 量化部署'} | ambiguous_quant | __SKILL_j6-plugin-__hbdk-generating |
| {'query': 'X5 PTQ', 'platform': 's100'} | platform_conflict | (none) |
| {'query': '量化模型 PTQ', 'platform': 'x5'} | default | x5-ptq-deploy |
| {'query': 'X5 和 S100 量化部署', 'platform': 'x5'} | platform_conflict | (none) |
