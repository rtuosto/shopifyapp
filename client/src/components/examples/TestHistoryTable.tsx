import TestHistoryTable from '../TestHistoryTable';

export default function TestHistoryTableExample() {
  const mockTests = [
    {
      id: "1",
      productName: "Wireless Bluetooth Speaker",
      testType: "Title Optimization",
      status: "active" as const,
      performance: 15.4,
      startDate: "Oct 18, 2025",
    },
    {
      id: "2",
      productName: "Smart Fitness Tracker",
      testType: "Price Test",
      status: "completed" as const,
      performance: 22.1,
      startDate: "Oct 15, 2025",
    },
    {
      id: "3",
      productName: "Ergonomic Office Chair",
      testType: "Image Variant",
      status: "active" as const,
      performance: -3.2,
      startDate: "Oct 20, 2025",
    },
    {
      id: "4",
      productName: "LED Desk Lamp",
      testType: "Description A/B Test",
      status: "draft" as const,
      performance: 0,
      startDate: "Oct 22, 2025",
    },
  ];

  return <TestHistoryTable tests={mockTests} />;
}