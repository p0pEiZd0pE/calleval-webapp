import { Card, CardHeader, CardContent } from "@/components/ui/card";
import {
  FileText,
  BarChart2,
  Phone,
  Smile,
} from "lucide-react";

export default function StatsCards() {
  const stats = [
    {
      title: "Total Reports Generated",
      icon: <FileText className="h-5 w-5 text-muted-foreground" />,
      value: "8,245",
      caption: "Last 30 days",
    },
    {
      title: "Average Score",
      icon: <BarChart2 className="h-5 w-5 text-muted-foreground" />,
      value: "88.5%",
      caption: "+5.2% from last month",
    },
    {
      title: "Calls Analyzed",
      icon: <Phone className="h-5 w-5 text-muted-foreground" />,
      value: "1,200",
      caption: "This week",
    },
    {
      title: "Satisfaction Rate",
      icon: <Smile className="h-5 w-5 text-muted-foreground" />,
      value: "92.1%",
      caption: "Across all evaluations",
    },
  ];

  return (
    <div className="grid grid-cols-2 grid-rows-2 gap-4 h-full w-full ">
      {stats.map((stat, idx) => (
        <Card key={idx} className="flex flex-col justify-between w-full h-full">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <p className="text-sm font-medium text-muted-foreground">{stat.title}</p>
            {stat.icon}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stat.value}</div>
            <p className="text-xs text-muted-foreground">{stat.caption}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
