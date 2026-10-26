
const API_URL = 'http://10.106.217.165:3000';
async function handleResponse(response) {
  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.error || data.message || "Something went wrong."
    );
  }

  return data;
}

export async function createApartment(apartmentName, memberName) {
  const response = await fetch(`${API_URL}/api/apartments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ apartmentName, memberName }),
  });

  return handleResponse(response);
}

export async function joinApartment(code, memberName) {
  const response = await fetch(`${API_URL}/api/apartments/join`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ code, memberName }),
  });

  return handleResponse(response);
}

export async function loginApartment(code, memberName) {
  const response = await fetch(`${API_URL}/api/apartments/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ code, memberName }),
  });

  return handleResponse(response);
}
