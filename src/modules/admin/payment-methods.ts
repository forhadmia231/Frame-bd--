import { z } from "zod";

const text = z.string().trim().max(150);
export const paymentMethodSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(["BANK", "BKASH_PERSONAL", "BKASH_MERCHANT", "NAGAD"]),
  label: text.min(1),
  enabled: z.boolean(),
  accountName: text,
  accountNumber: z.string().trim().max(64),
  bankName: text,
  branch: text,
  routingNumber: z.string().trim().max(32),
  instructions: z.string().trim().max(1000),
}).strict().superRefine((value, ctx) => {
  if (value.type === "BANK") {
    for (const field of ["bankName", "accountName", "accountNumber"] as const)
      if (!value[field]) ctx.addIssue({code: "custom", path: [field], message: "Required for bank transfer."});
    if (value.accountNumber && !/^[A-Za-z0-9 -]{3,64}$/.test(value.accountNumber))
      ctx.addIssue({code: "custom", path: ["accountNumber"], message: "Enter a valid bank account number."});
    if (value.routingNumber && !/^\d{9}$/.test(value.routingNumber))
      ctx.addIssue({code: "custom", path: ["routingNumber"], message: "Routing number must contain 9 digits."});
  } else if (!/^01[3-9]\d{8}$/.test(value.accountNumber)) {
    ctx.addIssue({code: "custom", path: ["accountNumber"], message: "Use an 11-digit Bangladesh mobile number, for example 01XXXXXXXXX."});
  }
});
export const paymentMethodsSchema = z.object({
  methods: z.array(paymentMethodSchema).max(30),
}).strict().superRefine(({methods}, ctx) => {
  if (new Set(methods.map(method => method.id)).size !== methods.length)
    ctx.addIssue({code: "custom", path: ["methods"], message: "Method IDs must be unique."});
});
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;
