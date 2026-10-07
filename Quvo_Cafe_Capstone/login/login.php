<?php
require_once __DIR__ . "/../includes/auth.php";
quvo_start_session();
?>

<!DOCTYPE html>
<html lang="en">

<head>
  <meta charset="utf-8" />

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  />

  <title>Sign in | Quvo Café Operations</title>

  <link
    rel="icon"
    type="image/png"
    href="../shared/images/quvo-favicon.png"
  />

  <link
    rel="stylesheet"
    href="../shared/css/styles.css"
  />

  <link
    rel="stylesheet"
    href="../shared/css/quvo-design-system.css"
  />

  <link
    rel="stylesheet"
    href="../shared/css/quvo-shell.css"
  />

  <link
    rel="stylesheet"
    href="login.css"
  />

  <script src="https://unpkg.com/lucide@latest"></script>

  <?php echo quvo_bootstrap(null); ?>

  <script src="../shared/js/auth.js"></script>
</head>

<body>

<section
  class="login-screen"
  id="loginScreen"
>

  <div class="login-shell">

    <!-- LEFT SIDE -->
    <div
      class="login-visual"
      aria-hidden="true"
    >

      <div class="login-visual-copy">

        <span class="login-kicker">
          Quvo Café Operations
        </span>

        <h2>
          One workspace for café service.
        </h2>

        <p>
          Cashier, order coordination, receipts,
          inventory monitoring, and administration.
        </p>

      </div>

    </div>


    <!-- LOGIN CARD -->
    <div class="login-card">

      <div class="login-logo-wrap">

        <img
          alt="Quvo Café logo"
          class="brand-logo-img"
          src="../shared/images/quvo-logo.jpg"
        />

      </div>


      <div class="eyebrow">
        Quvo Café Operations System
      </div>


      <h1>
        Welcome back
      </h1>


      <p id="loginDescription">
        Sign in with a staff account to open your operations workspace.
      </p>


      <!-- ACCESS TYPE -->
      <div class="login-role-field">

        <span
          class="login-role-label"
          id="loginRoleLabel"
        >
          Access type
        </span>


        <div
          class="login-role-switcher"
          role="radiogroup"
          aria-labelledby="loginRoleLabel"
        >

          <!-- STAFF -->
          <button
            class="login-role-option active"
            type="button"
            data-access="staff"
            role="radio"
            aria-checked="true"
          >

            <i
              data-lucide="users-round"
              aria-hidden="true"
            ></i>

            <span>

              <strong>
                Staff
              </strong>

              <small>
                Operations access
              </small>

            </span>

          </button>


          <!-- ADMIN -->
          <button
            class="login-role-option"
            type="button"
            data-access="admin"
            role="radio"
            aria-checked="false"
          >

            <i
              data-lucide="shield-check"
              aria-hidden="true"
            ></i>

            <span>

              <strong>
                Admin
              </strong>

              <small>
                Administration access
              </small>

            </span>

          </button>

        </div>

      </div>


      <!-- LOGIN FORM -->
      <div class="login-form">

        <label>

          Username

          <input
            autocomplete="username"
            id="loginUsername"
            placeholder="Enter staff username"
            type="text"
          />

        </label>


        <label>

          Password

          <input
            autocomplete="current-password"
            id="loginPassword"
            placeholder="Enter password"
            type="password"
          />

        </label>


        <div
          class="admin-error hidden"
          id="loginError"
          role="alert"
        ></div>


        <button
          class="btn dark login-submit"
          id="loginBtn"
          type="button"
        >

          <span>
            Sign in as Staff
          </span>

          <i data-lucide="arrow-right"></i>

        </button>

      </div>

    </div>

  </div>

</section>


<script src="login-page.js"></script>

</body>

</html>