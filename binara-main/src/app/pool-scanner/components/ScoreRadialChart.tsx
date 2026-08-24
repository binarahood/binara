'use client';

import React from 'react';
import { RadialBarChart, RadialBar, ResponsiveContainer } from 'recharts';

interface Props {
  score: number;
}

export default function ScoreRadialChart({ score }: Props) {
  const color =
    score >= 80 ? 'var(--positive)' : score >= 60 ? 'var(--warning)' : 'var(--negative)';

  const data = [{ value: score, fill: color }];

  return (
    <div className="w-20 h-20 flex-shrink-0">
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          cx="50%"
          cy="50%"
          innerRadius="60%"
          outerRadius="100%"
          startAngle={90}
          endAngle={-270}
          data={data}
        >
          <RadialBar dataKey="value" cornerRadius={4} background={{ fill: 'var(--muted)' }} />
        </RadialBarChart>
      </ResponsiveContainer>
    </div>
  );
}