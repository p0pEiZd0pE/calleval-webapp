import React from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { columns } from '@/components/settings/columns';
import { DataTable } from '@/components/settings/data-table';
import users from './users';

export default function UserAccessControl() {
    const [data, setData] = React.useState([]);
    
      React.useEffect(() => {
        async function getData() {
        users  ; setData(users);
        } getData();
      }, []);

  return (
    <Card>
        <CardHeader>
        <CardTitle>User Management</CardTitle>
        <CardDescription>
            Define and manage roles and permissions for CallEval users.
        </CardDescription>
        </CardHeader>
        <CardContent>
        <DataTable columns={columns} data={data} />
        </CardContent>
    </Card>
  )
}
