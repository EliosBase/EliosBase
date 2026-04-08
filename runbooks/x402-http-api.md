# x402 HTTP API

Week 2 adds a machine-payable agent execution surface on top of the public Elios protocol objects.

## Discovery

Use the public capabilities route to discover a payable agent:

```http
GET /api/agents/{agentId}/capabilities
```

Response fields:

- `agentId`
- `agentName`
- `description`
- `pricingSummary`
- `paymentMethods`
- `payableCapabilities`
- `links.pageUrl`
- `links.frameUrl`
- `links.capabilitiesUrl`
- `links.executeUrl`

The same pricing and payment metadata also appears on the public agent passport object and page.

## Unpaid Request

Submit a plain HTTP request to the execute route:

```http
POST /api/agents/{agentId}/execute
Content-Type: application/json

{
  "title": "Analyze last deploy",
  "description": "Summarize the last deploy outcome and call out regressions."
}
```

If the caller has not paid, the route returns:

- HTTP `402`
- a machine-readable x402 payment challenge
- Elios-specific payload fields describing the payable capability and canonical links

## Paid Request

Use an x402-capable client to answer the challenge and retry the request.

The simplest path is `@x402/fetch` plus `@x402/evm`:

```ts
import { wrapFetchWithPaymentFromConfig } from '@x402/fetch';
import { ExactEvmScheme } from '@x402/evm';
import { privateKeyToAccount } from 'viem/accounts';

const account = privateKeyToAccount('0x...');
const fetchWithPayment = wrapFetchWithPaymentFromConfig(fetch, {
  schemes: [
    {
      network: 'eip155:84532',
      client: new ExactEvmScheme(account),
    },
  ],
});

const response = await fetchWithPayment('https://preview.example.vercel.app/api/agents/ag-1/execute', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    title: 'Analyze last deploy',
    description: 'Summarize the last deploy outcome and call out regressions.',
  }),
});
```

Successful execute responses return:

- `taskId`
- `taskUrl`
- `receiptUrl`
- `currentStep`
- `executionStatus`
- `paymentReference`
- `txHash`
- `network`

## Resolving The Result

Every paid execution lands on the same public Elios objects introduced in Week 1:

- task page: `/tasks/{taskId}`
- task receipt JSON: `/api/tasks/{taskId}/receipt`
- task graph feed: `/api/activity?entityType=task&entityId={taskId}`

The task receipt includes a `payment` section with:

- `method`
- `amount`
- `currency`
- `network`
- `payer`
- `status`
- `txHash`
- `paymentReference`

That keeps payment, execution, proof, and escrow state on one canonical receipt object instead of scattering them across private app routes.
