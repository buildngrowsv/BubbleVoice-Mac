# Quick Reference - Gemini Structured Output

**Model**: Gemini 2.5 Flash-Lite  
**Use Case**: BubbleVoice AI conversations

---

## 🚨 Critical Rules

1. **Schema constraints > Prompt instructions** - Gemini ignores prompt text for limits
2. **Always add maxLength** - Prevents infinite looping
3. **Make critical fields required** - Or Gemini will omit them
4. **Budget 25% lower** - maxLength chars ÷ 4 × 0.75 = safe token estimate

---

## ✅ Good Schema Pattern

```javascript
{
  type: "object",
  properties: {
    response: { 
      type: "string",
      maxLength: 1000  // ~250 tokens
    },
    quote: {
      type: "string",
      maxLength: 200   // ~50 tokens - CRITICAL!
    }
  },
  required: ["response", "quote"]  // Make required!
}
```

---

## ❌ Bad Schema Pattern

```javascript
{
  type: "object",
  properties: {
    response: { 
      type: "string"  // ❌ No maxLength = can loop!
    },
    quote: {
      type: "string",
      description: "Keep under 50 tokens"  // ❌ IGNORED!
    }
  },
  required: ["response"]  // ❌ quote will be omitted
}
```

---

## 📊 Token Budget Formula

```
maxLength (chars) ÷ 4 = Approximate tokens
Multiply by 0.75 for safety margin

Example:
maxLength: 1000 chars
÷ 4 = 250 tokens
× 0.75 = 187 safe tokens
```

---

## 🔧 Configuration

```javascript
generationConfig: {
  responseMimeType: 'application/json',
  temperature: 0.7,
  maxOutputTokens: 12288,  // Total response limit
  responseSchema: YOUR_SCHEMA
}
```

---

## 🐛 Common Issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| Response hits 12K tokens | No maxLength | Add maxLength to all fields |
| Field missing | Not required | Add to required array |
| Repeating text | No maxLength on quote field | maxLength: 200 |
| Parse error | MAX_TOKENS hit | Increase maxOutputTokens or lower maxLength |

---

## 📈 Typical Token Usage

| Component | Tokens |
|-----------|--------|
| User response | 250 |
| Internal notes | 300 |
| Area actions (3) | 1,500 |
| HTML artifact | 5,000 |
| **Total** | **7,050** |

---

## 💰 Cost

- **Per turn**: $0.0003
- **Per 1,000 turns**: $0.31
- **Per 10,000 turns**: $3.07

---

## 🎯 Success Metrics

- **Area operations**: 100% ✅
- **Normal conversations**: 75-80% ✅
- **Overall**: 67% (acceptable for v1)
- **Target**: 95% (with tuning)
