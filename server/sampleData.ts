import * as XLSX from 'xlsx';

export function createSampleWorkbookBuffer(): Buffer {
  const wb = XLSX.utils.book_new();

  // Sheet 1: 财务收支年度宽表 (Wide Sheet -> Should trigger Landscape 横向)
  const financeHeaders = [
    '科目编号',
    '预算科目名称',
    '责任中心',
    '一季度',
    '二季度',
    '三季度',
    '四季度',
    '年度累计预算',
    '实际执行额',
    '预算达成率',
    '同比增幅',
    '风险评级',
    '审计备注说明',
  ];

  const financeRows = [
    ['1001', '研发基础设施支出', '技术研发部', '1,200,000', '1,350,000', '1,500,000', '1,420,000', '5,470,000', '5,120,000', '93.6%', '+12.4%', '低', '符合预期进度'],
    ['1002', '云服务器与网络算力', '运维架构部', '850,000', '920,000', '1,100,000', '1,050,000', '3,920,000', '3,880,000', '99.0%', '+28.5%', '中', 'AI模型训练增量'],
    ['1003', '全球品牌数字化营销', '市场增长中心', '600,000', '780,000', '890,000', '950,000', '3,220,000', '3,150,000', '97.8%', '+15.2%', '低', 'Q4海外投放集中'],
    ['1004', '核心人才薪酬与期权', '人力资源部', '3,500,000', '3,650,000', '3,800,000', '3,900,000', '14,850,000', '14,600,000', '98.3%', '+8.7%', '低', '团队稳步扩张'],
    ['1005', '办公职场租赁与能耗', '行政综合中心', '420,000', '420,000', '430,000', '430,000', '1,700,000', '1,680,000', '98.8%', '+2.1%', '低', '租约固定期内'],
    ['1006', '合规风控与法律法务', '法务风控部', '180,000', '220,000', '250,000', '290,000', '940,000', '910,000', '96.8%', '+18.9%', '中', '跨国知识产权审查'],
    ['1007', '客户成功与VIP服务支持', '客户服务部', '320,000', '350,000', '380,000', '410,000', '1,460,000', '1,420,000', '97.3%', '+14.1%', '低', '大客户满意度99%'],
  ];

  const wsFinance = XLSX.utils.aoa_to_sheet([financeHeaders, ...financeRows]);
  XLSX.utils.book_append_sheet(wb, wsFinance, '财务年度预算宽表');

  // Sheet 2: 团队员工考核明细表 (Tall Sheet -> Should trigger Portrait 纵向, with repeat headers)
  const staffHeaders = ['工号', '员工姓名', '所在部门', '职级', '季度KPI', '考核等级', '主管评语', '状态'];
  const staffRows: any[][] = [];
  const departments = ['技术研发部', '产品设计部', '市场商务部', '客户成功部', '运营支撑部'];
  const grades = ['S (卓越)', 'A (优秀)', 'B+ (良好)', 'B (合格)'];

  for (let i = 1; i <= 36; i++) {
    const empId = `EMP${String(1000 + i)}`;
    const name = `员工_${String.fromCharCode(65 + (i % 26))}${i}`;
    const dept = departments[i % departments.length];
    const level = `P${5 + (i % 4)}`;
    const score = (88 + (i * 3) % 12).toFixed(1);
    const grade = grades[i % grades.length];
    const note = i % 3 === 0 ? '超额达成重点攻坚项目里程碑' : '工作踏实负责，协同配合顺畅';
    staffRows.push([empId, name, dept, level, score, grade, note, '在职']);
  }

  const wsStaff = XLSX.utils.aoa_to_sheet([staffHeaders, ...staffRows]);
  XLSX.utils.book_append_sheet(wb, wsStaff, '团队员工考核明细');

  // Generate buffer
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
