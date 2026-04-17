import React from 'react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Legend
} from 'recharts';

interface TrendData {
  date: string;
  moisture: number;
  oil: number;
  sensitivity: number;
  overall: number;
}

interface SkinTrendChartProps {
  data: TrendData[];
}

const SkinTrendChart: React.FC<SkinTrendChartProps> = ({ data }) => {
  // Format dates for display
  const formattedData = data.map(d => ({
    ...d,
    displayDate: new Date(d.date).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
  })).reverse(); // Oldest to newest for the chart

  return (
    <div className="w-full h-[200px] mt-4">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={formattedData}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
          <XAxis 
            dataKey="displayDate" 
            axisLine={false} 
            tickLine={false} 
            tick={{ fontSize: 10, fill: '#94A3B8' }}
          />
          <YAxis hide domain={[0, 100]} />
          <Tooltip 
            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
            labelStyle={{ fontWeight: 'bold', marginBottom: '4px' }}
          />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 10, paddingTop: '10px' }} />
          <Line 
            type="monotone" 
            dataKey="moisture" 
            name="水分" 
            stroke="#3B82F6" 
            strokeWidth={3} 
            dot={{ r: 4, fill: '#3B82F6' }} 
            activeDot={{ r: 6 }} 
          />
          <Line 
            type="monotone" 
            dataKey="sensitivity" 
            name="敏感" 
            stroke="#EF4444" 
            strokeWidth={3} 
            dot={{ r: 4, fill: '#EF4444' }} 
            activeDot={{ r: 6 }} 
          />
          <Line 
            type="monotone" 
            dataKey="overall" 
            name="综合" 
            stroke="#8B5CF6" 
            strokeWidth={3} 
            dot={{ r: 4, fill: '#8B5CF6' }} 
            activeDot={{ r: 6 }} 
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default SkinTrendChart;
