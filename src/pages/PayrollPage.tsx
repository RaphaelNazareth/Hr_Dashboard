import { type FC } from "react";
import { DollarSign } from "lucide-react";

export const PayrollPage: FC = () => (
  <div className="flex h-full flex-col items-center justify-center gap-3 p-12 text-muted-foreground">
    <DollarSign className="h-10 w-10" />
    <h2 className="text-lg font-semibold text-foreground">Payroll</h2>
    <p className="max-w-sm text-center text-sm">
      Salary processing, payslips, and compensation management. Coming soon.
    </p>
  </div>
);

export default PayrollPage;
