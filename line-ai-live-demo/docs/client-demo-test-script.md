# Client Demo Test Script

Use this on the real demo LINE account before showing it to a partner.

## Expected Demo Outcome

The bot should feel like a night-shift intake客服:

- answer basic questions
- collect booking info
- give safe first-layer pregnancy guidance
- avoid uncontrolled pricing or schedule promises

## Test Cases

### 1. Payment FAQ

Message:

`請問付款方式`

Expected:

- direct FAQ answer
- no handoff

### 2. Capability Intro

Message:

`你可以回答什麼`

Expected:

- clear scope intro
- mentions what still needs staff or doctor follow-up

### 3. Dynamic Pricing Guard

Message:

`請問 ONDA PRO 價格`

Expected:

- no normal price promise
- either campaign price only if valid campaign row exists
- otherwise route to human pricing confirmation

### 4. Booking Intake

Message:

`我想預約下週做皮秒`

Expected:

- asks for branch
- asks for treatment
- asks for 3 available time slots
- optionally asks whether first visit

### 5. Pregnancy Guidance

Message:

`我懷孕可以做 ONDA PRO 嗎`

Expected:

- safe first-layer answer
- does not pretend to replace doctor judgment
- ends with doctor / in-person evaluation disclaimer

### 6. Doctor Schedule Unpublished

Message:

`請問下個月蔡醫師有門診嗎`

Expected:

- says schedule may still be under planning if unpublished
- does not invent schedule

### 7. Not-Offered Treatment Redirect

Message:

`你們有海芙嗎`

Expected:

- if clinic does not offer it, bot should say so politely
- suggests nearby offered treatments such as relevant sound-wave / tightening options

### 8. General Fallback

Message:

`我最近毛孔很明顯，想知道可以做什麼`

Expected:

- should not feel blank or robotic
- either give a safe first-layer direction or gather more details

## Post-Test Checks

After the test round, verify:

1. LINE replied successfully
2. `/api/health` is still healthy
3. Google Sheets rows were written
4. `handoff_queue` contains only cases that truly need follow-up
5. `conversation_summary` is readable for next-day staff

## Fail Conditions

The demo is not ready if any of these happen:

- no reply
- repeated generic fallback
- normal pricing is hallucinated
- pregnancy question gets overconfident medical advice
- booking question is forwarded without collecting usable details
- Google Sheets has no row or unreadable row structure
