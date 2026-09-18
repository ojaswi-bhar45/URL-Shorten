import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  vus: 20,
  duration: "10s",
};

export default function () {
  const res = http.get("http://localhost:3000/BBPWM8F", {
    redirects: 0,
  });

  console.log(`STATUS: ${res.status}`);

  check(res, {
    "status is 302": (r) => r.status === 302,
  });

  sleep(0.5);
}