import { canReviewNluDisagreements } from "@/lib/admin-auth";

if (canReviewNluDisagreements("analyst")) throw new Error("analyst must not see customer-linked NLU disagreements");
if (!canReviewNluDisagreements("owner") || !canReviewNluDisagreements("maintainer")) throw new Error("engineering reviewers require access");
console.log("NLU review boundary validation passed");
