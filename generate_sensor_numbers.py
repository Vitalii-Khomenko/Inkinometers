from datetime import datetime
import random


MIN_5_DIGIT = 10000
MAX_5_DIGIT = 99999
MIN_6_DIGIT = 100000
MAX_6_DIGIT = 999999
MAX_UNIQUE_NUMBERS = (MAX_5_DIGIT - MIN_5_DIGIT + 1) + (MAX_6_DIGIT - MIN_6_DIGIT + 1)
MAX_5_DIGIT_COUNT = MAX_5_DIGIT - MIN_5_DIGIT + 1
MAX_6_DIGIT_COUNT = MAX_6_DIGIT - MIN_6_DIGIT + 1


def ask_count():
    while True:
        value = input("How many sensor numbers should be generated? ").strip()

        try:
            count = int(value)
        except ValueError:
            print("Please enter a whole number.")
            continue

        if count <= 0:
            print("The number must be greater than 0.")
            continue

        if count > MAX_UNIQUE_NUMBERS:
            print(f"The maximum is {MAX_UNIQUE_NUMBERS} unique sensor numbers.")
            continue

        return count


def generate_sensor_numbers(count):
    five_digit_count = min(count // 2, MAX_5_DIGIT_COUNT)
    six_digit_count = count - five_digit_count

    if six_digit_count > MAX_6_DIGIT_COUNT:
        overflow = six_digit_count - MAX_6_DIGIT_COUNT
        six_digit_count = MAX_6_DIGIT_COUNT
        five_digit_count += overflow

    numbers = [
        *random.sample(range(MIN_5_DIGIT, MAX_5_DIGIT + 1), five_digit_count),
        *random.sample(range(MIN_6_DIGIT, MAX_6_DIGIT + 1), six_digit_count),
    ]
    random.shuffle(numbers)

    return [str(number) for number in numbers]


def save_numbers(numbers):
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    file_name = f"sensor_numbers_{timestamp}.txt"

    with open(file_name, "w", encoding="utf-8") as file:
        file.write("\n".join(numbers))
        file.write("\n")

    return file_name


def main():
    count = ask_count()
    numbers = generate_sensor_numbers(count)
    file_name = save_numbers(numbers)

    print(f"Done: generated {len(numbers)} sensor numbers.")
    print(f"File saved: {file_name}")


if __name__ == "__main__":
    main()
