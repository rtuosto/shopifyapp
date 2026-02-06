import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface DataPoint {
  date: string;
  revenue: number;
}

interface PerformanceChartProps {
  data: DataPoint[];
  title?: string;
}

export default function PerformanceChart({ data, title = "Revenue Trend (30 Days)" }: PerformanceChartProps) {
  return (
    <s-section data-testid="card-performance-chart">
      <s-text variant="headingSm" fontWeight="semibold" data-testid="text-chart-title">{title}</s-text>
      <s-box padding="base none">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
            <XAxis 
              dataKey="date" 
              stroke="#8c9196" 
              fontSize={12}
              tickLine={false}
            />
            <YAxis 
              stroke="#8c9196" 
              fontSize={12}
              tickLine={false}
              tickFormatter={(value) => `$${(value / 1000).toFixed(1)}k`}
            />
            <Tooltip 
              contentStyle={{
                backgroundColor: "#fff",
                border: "1px solid #e0e0e0",
                borderRadius: "8px",
              }}
              formatter={(value: number) => [`$${value.toLocaleString()}`, "Revenue"]}
            />
            <Line 
              type="monotone" 
              dataKey="revenue" 
              stroke="#2c6ecb"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </s-box>
    </s-section>
  );
}
