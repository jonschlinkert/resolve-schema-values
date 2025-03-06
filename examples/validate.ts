import { resolveValues } from '~/resolve';

// Example schema
const userSchema = {
  type: 'object',
  required: ['username', 'email', 'age'],
  properties: {
    username: {
      type: 'string',
      minLength: 3,
      maxLength: 20
    },
    email: {
      type: 'string',
      format: 'email'
    },
    age: {
      type: 'integer',
      minimum: 18
    },
    preferences: {
      type: 'object',
      properties: {
        notifications: {
          type: 'boolean',
          default: true
        }
      }
    }
  }
};

async function validateUser(userData: any) {
  const result = await resolveValues(userSchema, userData);

  if (!result.ok) {
    return {
      valid: false,
      errors: result.errors.map(err => ({
        message: err.message,
        path: err.path?.join('.') || ''
      }))
    };
  }

  return {
    valid: true,
    data: result.value
  };
}

// Example usage:
const validUser = {
  username: 'johndoe',
  email: 'john@example.com',
  age: 25
};

const invalidUser = {
  username: 'j', // too short
  email: 'not-an-email',
  age: 16 // under minimum
};

const main = async () => {
  // These would show how validation works:
  console.log(await validateUser(validUser));
  // Returns: { valid: true, data: { username: "johndoe", ... } }

  console.log(await validateUser(invalidUser));
  // Returns: {
  //   valid: false,
  //   errors: [
  //     { message: "String length must be >= 3", path: "username" },
  //     { message: "Invalid email format", path: "email" },
  //     { message: "Value must be >= 18", path: "age" }
  //   ]
  // }
};

main();
