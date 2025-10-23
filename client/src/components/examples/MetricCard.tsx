import MetricCard from '../MetricCard';

export default function MetricCardExample() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <MetricCard 
        title="Conversion Rate" 
        value="3.42%" 
        change={12.5} 
        trend="up"
        subtitle="vs. last 30 days"
      />
      <MetricCard 
        title="Avg Order Value" 
        value="$87.50" 
        change={-3.2} 
        trend="down"
        subtitle="vs. last 30 days"
      />
      <MetricCard 
        title="Revenue Lift" 
        value="$12,450" 
        change={24.8} 
        trend="up"
        subtitle="from optimizations"
      />
      <MetricCard 
        title="Active Tests" 
        value="8" 
        subtitle="running now"
      />
    </div>
  );
}