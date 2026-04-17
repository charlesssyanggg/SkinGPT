/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer } from 'recharts';

interface SkinRadarChartProps {
  data: { name: string; value: number }[];
}

export default function SkinRadarChart({ data }: SkinRadarChartProps) {
  return (
    <div className="w-full h-48 my-4">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart cx="50%" cy="50%" outerRadius="70%" data={data}>
          <PolarGrid stroke="#E2E8F0" />
          <PolarAngleAxis dataKey="name" tick={{ fill: '#6B7280', fontSize: 10, fontWeight: 500 }} />
          <Radar
            name="Skin Condition"
            dataKey="value"
            stroke="#2F80ED"
            fill="#2F80ED"
            fillOpacity={0.2}
            strokeWidth={2}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
