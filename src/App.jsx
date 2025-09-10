import React, { useEffect, useState } from "react";
import { Plus, Receipt, Wallet, X, CheckCircle, AlertTriangle } from "lucide-react";

const API_BASE = "https://pabbji3xdh.execute-api.us-east-1.amazonaws.com/dev";
const S3_BASE = "https://expense-receipts-pugazh-001.s3.us-east-1.amazonaws.com/receipts/";
const USE_MOCK = false;

let mockExpensesStore = [
  { id: "mock-1", title: "Coffee", amount: 120, date: "2025-08-28", category: "Food", receiptKey: null },
  { id: "mock-2", title: "Books", amount: 599, date: "2025-08-22", category: "Education", receiptKey: "mock-2-receipt.jpg" },
];

function normalizeExpense(raw) {
  console.log("Raw data:", raw);
  
  if (!raw) return null;
  
  // Extract receiptKey properly - FIXED
  let receiptKey = null;
  if (raw.receiptKey) {
    if (typeof raw.receiptKey === "object" && raw.receiptKey.S) {
      receiptKey = raw.receiptKey.S;
    } else if (typeof raw.receiptKey === "string") {
      receiptKey = raw.receiptKey;
    }
  }
  
  // Extract expenseId properly - FIXED
  let id = "";
  if (raw.expenseId) {
    if (typeof raw.expenseId === "object" && raw.expenseId.S) {
      id = raw.expenseId.S;
    } else if (typeof raw.expenseId === "string") {
      id = raw.expenseId;
    }
  }
  
  // If no proper ID, generate one
  if (!id) {
    id = raw.id || raw.expense_id || raw.key || Math.random().toString(36).slice(2, 9);
  }
  
  // Extract title
  let title = "";
  if (raw.title) {
    if (typeof raw.title === "object" && raw.title.S) {
      title = raw.title.S;
    } else if (typeof raw.title === "string") {
      title = raw.title;
    }
  }
  
  // Skip items with empty titles
  if (!title || title.trim() === "") {
    return null;
  }
  
  // Return normalized expense
  return {
    id: String(id),
    title: title,
    amount: raw.amount?.N ? Number(raw.amount.N) : (raw.amount ? Number(raw.amount) : 0),
    date: raw.date?.S || raw.date || "",
    category: raw.category?.S || raw.category || "",
    receiptKey: receiptKey,
  };
}

export default function ExpenseTracker() {
  const [expenses, setExpenses] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [newExpense, setNewExpense] = useState({ title: "", amount: "", date: "", category: "", file: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [tests, setTests] = useState([]);

  async function fetchExpenses() {
  setLoading(true);
  setError("");
  setInfo("");
  if (USE_MOCK) {
    const list = mockExpensesStore.map(normalizeExpense).filter(Boolean);
    console.log("Mock expenses with receipts:", list.filter(exp => exp.receiptKey)); // ADD THIS
    setExpenses(list);
    setInfo("MOCK mode — no backend configured. Set REACT_APP_API_BASE to use the real API.");
    setLoading(false);
    return list;
  }
  try {
    console.log("Fetching from:", `${API_BASE}/expenses`);
    const res = await fetch(`${API_BASE}/expenses`);
    console.log("Response status:", res.status);
    
    if (!res.ok) {
      const errorText = await res.text();
      console.error("API error response:", errorText);
      throw new Error(`API returned ${res.status}: ${errorText}`);
    }
    
    const data = await res.json();
    console.log("Raw API response data:", data);
    
    let list = [];
    if (Array.isArray(data)) list = data.map(normalizeExpense);
    else if (data && Array.isArray(data.Items)) list = data.Items.map(normalizeExpense);
    else if (data && Array.isArray(data.expenses)) list = data.expenses.map(normalizeExpense);
    else if (data && data.Items) list = data.Items.map(normalizeExpense);
    else if (typeof data === "object") list = [normalizeExpense(data)];
    
    console.log("Filtered expenses:", list); // ADD THIS
    console.log("Expenses with receipts:", list.filter(exp => exp && exp.receiptKey)); // ADD THIS
    
    list = list.filter(Boolean);
    setExpenses(list);
    return list;
  } catch (err) {
    console.error("fetchExpenses error:", err);
    setError(`Failed to fetch expenses: ${err.message}. Check API_BASE, network and CORS. Falling back to MOCK data.`);
    const list = mockExpensesStore.map(normalizeExpense).filter(Boolean);
    setExpenses(list);
    return list;
  } finally {
    setLoading(false);
  }
}

  useEffect(() => {
  console.log("API_BASE:", API_BASE);
  console.log("USE_MOCK:", USE_MOCK);
  fetchExpenses();
}, []);

  function handleInputChange(e) {
    const { name, value, files } = e.target;
    if (files && files.length) setNewExpense((s) => ({ ...s, file: files[0] }));
    else setNewExpense((s) => ({ ...s, [name]: value }));
  }

  async function createExpenseOnServer(exp) {
  // ADD VALIDATION: Reject empty titles
  if (!exp.title || exp.title.trim() === "") {
    throw new Error("Title cannot be empty");
  }
  
  if (USE_MOCK) {
    const id = `mock-${Math.random().toString(36).slice(2, 9)}`;
    const created = { 
      id, 
      title: exp.title, 
      amount: Number(exp.amount), 
      date: exp.date || new Date().toISOString().slice(0, 10), 
      category: exp.category 
    };
    mockExpensesStore = [created, ...mockExpensesStore];
    return id;
  }
  
  const res = await fetch(`${API_BASE}/expenses`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ 
      title: exp.title, 
      amount: Number(exp.amount), 
      date: exp.date, 
      category: exp.category 
    }),
  });
  
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Create expense failed: ${res.status} ${text}`);
  }
  
  const data = await res.json();
  return data?.expenseId || data?.id || data?.expense_id || data?.idValue || null;
}

  async function requestPresign(expenseId) {
    if (USE_MOCK) return { uploadUrl: `https://example.com/mock-upload/${expenseId}.bin`, receiptId: `${expenseId}-receipt` };
    try {
      const resp = await fetch(`${API_BASE}/receipts/presign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expenseId }),
      });
      if (resp.ok) return await resp.json();
    } catch (e) {
      console.debug("presign POST failed", e);
    }
    try {
      const resp2 = await fetch(`${API_BASE}/receipts/presign?expenseId=${encodeURIComponent(expenseId)}`);
      if (resp2.ok) return await resp2.json();
    } catch (e) {
      console.debug("presign GET failed", e);
    }
    throw new Error("Presign request failed (tried POST and GET)");
  }

  async function uploadToS3WithRetries(uploadUrl, file) {
    try {
      const resp = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`S3 upload returned ${resp.status}: ${text}`);
      }
      return true;
    } catch (e1) {
      try {
        const resp2 = await fetch(uploadUrl, { method: "PUT", body: file });
        if (!resp2.ok) {
          const text2 = await resp2.text();
          throw new Error(`S3 upload (no header) returned ${resp2.status}: ${text2}`);
        }
        return true;
      } catch (e2) {
        throw new Error(`Upload failed. Attempts: [with-header: ${e1.message}], [no-header: ${e2.message}]`);
      }
    }
  }

  async function handleAddExpense() {
  setError("");
  setInfo("");
  
  // ADD FORM VALIDATION
  const trimmedTitle = newExpense.title.trim();
  if (!trimmedTitle) {
    setError("Please provide a title for the expense.");
    return;
  }
  
  if (!newExpense.amount || Number(newExpense.amount) <= 0) {
    setError("Please provide a valid amount.");
    return;
  }
  
  setLoading(true);
  try {
    const createdId = await createExpenseOnServer({
      ...newExpense,
      title: trimmedTitle // Use trimmed title
    });
    
    if (!createdId) throw new Error("Server did not return an expense id");
    
    // In handleAddExpense function:
if (newExpense.file) {
  const presign = await requestPresign(createdId); // Use the same createdId
  if (!presign || !presign.uploadUrl) throw new Error("Presign response missing uploadUrl");
  await uploadToS3WithRetries(presign.uploadUrl, newExpense.file);
}
    
    await fetchExpenses();
    setShowModal(false);
    setNewExpense({ title: "", amount: "", date: "", category: "", file: null });
    setInfo("Expense saved successfully.");
    
  } catch (err) {
    console.error("Error adding expense", err);
    setError(typeof err === "string" ? err : err.message || "Unknown error while adding expense");
  } finally {
    setLoading(false);
  }
}

  async function runSelfTests() {
  const results = [];
  try {
    console.log("API_BASE:", API_BASE);
    console.log("USE_MOCK:", USE_MOCK);
    
    const list = await fetchExpenses();
    results.push({ name: "fetchExpenses", ok: Array.isArray(list), note: `loaded ${Array.isArray(list) ? list.length : 0} items (mock or real)` });
    
    if (USE_MOCK) {
      const id = await createExpenseOnServer({ title: "SelfTest", amount: 5, date: "2025-08-28", category: "test" });
      const newList = await fetchExpenses();
      results.push({ name: "createExpense (mock)", ok: !!id && newList.some((i) => i.id === id), note: `created ${id}` });
    } else {
      // Actually test real API creation instead of skipping
      try {
        const res = await fetch(`${API_BASE}/expenses`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "SelfTest", amount: 5, date: "2023-12-01", category: "test" })
        });
        const success = res.ok;
        results.push({ name: "createExpense (real API)", ok: success, note: success ? "created successfully" : `failed: ${res.status}` });
      } catch (e) {
        results.push({ name: "createExpense (real API)", ok: false, note: `error: ${e.message}` });
      }
    }
  } catch (e) {
    results.push({ name: "selfTestError", ok: false, note: String(e) });
  }
  setTests(results);
}

async function deleteExpense(expenseId) {
  if (!window.confirm("Are you sure you want to delete this expense?")) {
    return;
  }

  try {
    console.log("Deleting expense:", expenseId);
    
    // CORRECT URL: No "receipts/" in the path
    const response = await fetch(`${API_BASE}/expenses/${expenseId}`, {
      method: "DELETE"
    });

    console.log("Delete response status:", response.status);
    
    if (response.ok) {
      const result = await response.json();
      console.log("Delete successful:", result);
      
      // ONLY remove from UI after successful API deletion
      setExpenses(prevExpenses => prevExpenses.filter(exp => exp.id !== expenseId));
      setInfo("Expense deleted successfully.");
      
    } else {
      const errorText = await response.text();
      console.error("Delete failed:", errorText);
      throw new Error(`Server returned ${response.status}: ${errorText}`);
    }
  } catch (err) {
    console.error("Delete error:", err);
    setError("Error deleting expense: " + err.message);
    
    // DON'T remove from UI if deletion failed
    // The item stays in the list so user can try again
  }
}

async function getReceiptUrl(receiptKey) {
  if (!receiptKey) return null;
  
  try {
    const response = await fetch(`${API_BASE}/download?receiptKey=${receiptKey}`);
    
    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }
    
    const data = await response.json();
    return data.downloadUrl;
  } catch (error) {
    console.error("Error getting download URL:", error);
    // Fallback to direct S3 URL (may still fail due to CORS)
    return `https://expense-receipts-pugazh-001.s3.us-east-1.amazonaws.com/${receiptKey}`;
  }
}

const handleReceiptClick = async (receiptKey, e) => {
  e.preventDefault();
  e.stopPropagation();
  
  if (!receiptKey) return;
  
  setLoading(true);
  try {
    const url = await getReceiptUrl(receiptKey);
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  } catch (error) {
    console.error("Error handling receipt click:", error);
    setError("Failed to open receipt. Please try again.");
  } finally {
    setLoading(false);
  }
};

  function s3UrlForKey(key) {
    if (!key) return null;
    if (S3_BASE) return `${S3_BASE.replace(/\/$/, "")}/${key}`;
    return `https://your-s3-bucket.s3.amazonaws.com/${key}`;
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold mb-4 flex items-center gap-2">
          <Wallet className="w-6 h-6 text-purple-600" /> Expense Tracker
        </h1>

        {USE_MOCK && (
          <div className="mb-4 p-3 bg-yellow-50 border-l-4 border-yellow-300 text-sm rounded">
            <strong>MOCK mode:</strong> No API_BASE configured. Set <code className="mx-1">REACT_APP_API_BASE</code> to use real backend.
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-red-50 border-l-4 border-red-300 text-sm rounded flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5" />
            <div>
              <div className="font-medium">Error</div>
              <div className="text-xs">{error}</div>
            </div>
          </div>
        )}

        {info && (
          <div className="mb-4 p-3 bg-green-50 border-l-4 border-green-300 text-sm rounded flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
            <div>
              <div className="font-medium">Info</div>
              <div className="text-xs">{info}</div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mb-4">
          <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-2xl shadow hover:bg-purple-700">
            <Plus className="w-4 h-4" /> Add Expense
          </button>

          <div className="flex items-center gap-2">
            <button onClick={fetchExpenses} className="px-3 py-2 bg-white border rounded shadow text-sm" disabled={loading}>
              Refresh
            </button>
            <button onClick={runSelfTests} className="px-3 py-2 bg-white border rounded shadow text-sm">Run Self-tests</button>
          </div>
        </div>

        <div className="grid gap-4">
          {loading && <div className="text-sm text-gray-500">Loading...</div>}

          {expenses.map((exp) => (
  <div key={exp.id} className="bg-white rounded-2xl p-4 shadow-sm flex justify-between items-center">
    <div>
      <h2 className="font-semibold">{exp.title}</h2>
      <p className="text-sm text-gray-500">{exp.date}</p>
      <p className="text-xs text-gray-400">{exp.category}</p>
    </div>

    <div className="flex items-center gap-3">
      <span className="font-bold text-purple-600">₹{exp.amount}</span>
      {exp.receiptKey && (
        <a 
    href="#" 
    onClick={(e) => handleReceiptClick(exp.receiptKey, e)}
    className="cursor-pointer hover:text-purple-600 transition-colors"
    title="View receipt"
  >
    <Receipt className="w-5 h-5 text-gray-600 hover:text-purple-600" />
  </a>
      )}
      {/* Add delete button */}
      <button 
        onClick={() => deleteExpense(exp.id)}
        className="text-red-500 hover:text-red-700 p-1"
        title="Delete expense"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  </div>
))}

          {expenses.length === 0 && !loading && <div className="text-sm text-gray-500">No expenses yet.</div>}
        </div>

        {showModal && (
          <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-40">
            <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-lg relative">
              <button onClick={() => setShowModal(false)} className="absolute top-3 right-3 text-gray-500 hover:text-gray-800">
                <X className="w-5 h-5" />
              </button>

              <h2 className="text-xl font-semibold mb-4">Add New Expense</h2>

              <input type="text" name="title" placeholder="Title" value={newExpense.title} onChange={handleInputChange} className="w-full mb-3 p-2 border rounded-lg" />
              <input type="number" name="amount" placeholder="Amount" value={newExpense.amount} onChange={handleInputChange} className="w-full mb-3 p-2 border rounded-lg" />
              <input type="date" name="date" value={newExpense.date} onChange={handleInputChange} className="w-full mb-3 p-2 border rounded-lg" />
              <input type="text" name="category" placeholder="Category" value={newExpense.category} onChange={handleInputChange} className="w-full mb-3 p-2 border rounded-lg" />
              <input type="file" name="file" onChange={handleInputChange} className="w-full mb-4" />

              <div className="flex gap-2">
                <button onClick={handleAddExpense} className="flex-1 bg-purple-600 text-white py-2 rounded-lg hover:bg-purple-700">{loading ? 'Saving...' : 'Save Expense'}</button>
                <button onClick={() => { setShowModal(false); setNewExpense({ title: "", amount: "", date: "", category: "", file: null }); }} className="px-4 py-2 border rounded-lg">Cancel</button>
              </div>
            </div>
          </div>
        )}

        {tests.length > 0 && (
          <div className="mt-6">
            <h3 className="font-semibold mb-2">Self-test results</h3>
            <ul className="text-sm">
              {tests.map((t, idx) => (
                <li key={idx} className={`mb-1 ${t.ok ? 'text-green-700' : 'text-red-600'}`}>
                  {t.ok ? '✓' : '✗'} {t.name} — {t.note}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}