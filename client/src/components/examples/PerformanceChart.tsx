import PerformanceChart from '../PerformanceChart';

export default function PerformanceChartExample() {
  //todo: remove mock functionality
  const mockData = [
    { date: "Oct 1", revenue: 12400 },
    { date: "Oct 5", revenue: 13200 },
    { date: "Oct 10", revenue: 14100 },
    { date: "Oct 15", revenue: 15800 },
    { date: "Oct 20", revenue: 17200 },
    { date: "Oct 23", revenue: 18500 },
  ];

  return <PerformanceChart data={mockData} />;
}