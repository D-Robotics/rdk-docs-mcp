import {describe,it,expect} from 'vitest';
import {analyzeIntent} from './skill-intent.js';
describe('natural language intent boundaries',()=>{
 it.each(['X5 有没有已经量化好的模型','already quantized models for X5','pre-quantized model zoo','找一个能直接跑的官方模型','下载官方模型','不量化，只部署现成模型'])('ready: %s',q=>expect(analyzeIntent(q).intent).toBe('ready_model'));
 it.each(['X5 摄像头直接用','X5 串口开箱即用'])('not model: %s',q=>expect(analyzeIntent(q).intent).toBe('other'));
 it('unpunctuated negation',()=>expect(analyzeIntent('不要现成模型我要自己量化').intent).toBe('quantize'));
 it.each(['X5 post training quantization','X5 训练后量化 PTQ'])('PTQ full name: %s',q=>expect(analyzeIntent(q).decidedQuantPath).toBe('ptq'));
 it('maintainer concept',()=>expect(analyzeIntent('模型库发版流程').conceptTokens).toContain('zoo'));
});
